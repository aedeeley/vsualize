//! Endpoint-independent audio analysis. No device handles, files, or UI dependencies.
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::{f32::consts::PI, sync::Arc};

pub const FFT_SIZE: usize = 2048;
pub const BANDS: usize = 128;
pub const WAVE: usize = 256;

#[derive(Clone, Debug)]
pub struct Analysis {
    pub rms: f32,
    /// Linear, mean-square spectral magnitude, before logarithmic display scaling.
    pub power: [f32; BANDS],
    pub waveform: [f32; WAVE],
}
impl Default for Analysis {
    fn default() -> Self {
        Self { rms: 0.0, power: [0.0; BANDS], waveform: [0.0; WAVE] }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Encoding { Float32, Float64, Signed16, Signed24, Signed32, Unsigned8 }
#[derive(Clone, Copy, Debug)]
pub struct PcmFormat {
    pub channels: usize,
    pub sample_rate: u32,
    pub stride: usize,
    pub sample_bytes: usize,
    pub encoding: Encoding,
}
impl PcmFormat {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=32).contains(&self.channels) || !(8000..=384000).contains(&self.sample_rate) {
            return Err("Unsupported endpoint channel count or sample rate".into());
        }
        let expected = match self.encoding {
            Encoding::Float32 | Encoding::Signed32 => 4,
            Encoding::Float64 => 8, Encoding::Signed16 => 2,
            Encoding::Signed24 => 3, Encoding::Unsigned8 => 1,
        };
        if self.sample_bytes != expected || self.stride < self.channels * self.sample_bytes {
            return Err("Invalid PCM sample size or frame alignment".into());
        }
        Ok(())
    }
    pub fn decode(&self, bytes: &[u8]) -> f32 {
        if bytes.len() < self.sample_bytes { return 0.0; }
        let value = match self.encoding {
            Encoding::Float32 => f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
            Encoding::Float64 => f64::from_le_bytes([
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            ]) as f32,
            Encoding::Signed16 => i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / 32768.0,
            Encoding::Signed24 => {
                let value = ((bytes[2] as i32) << 24 | (bytes[1] as i32) << 16 | (bytes[0] as i32) << 8) >> 8;
                value as f32 / 8388608.0
            }
            Encoding::Signed32 => i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as f32 / 2147483648.0,
            Encoding::Unsigned8 => (bytes[0] as f32 - 128.0) / 128.0,
        };
        if value.is_finite() { value.clamp(-1.0, 1.0) } else { 0.0 }
    }
}

pub struct Analyzer {
    format: PcmFormat,
    ring: Vec<Vec<f32>>,
    cursor: usize,
    filled: usize,
    pending: usize,
    hop: usize,
    window: Vec<f32>,
    power_scale: f32,
    band_bins: [(usize, usize); BANDS],
    all_power: [f32; FFT_SIZE / 2],
    fft: Arc<dyn Fft<f32>>,
    work: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
}
impl Analyzer {
    pub fn new(format: PcmFormat) -> Result<Self, String> {
        format.validate()?;
        let fft = FftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE);
        let window: Vec<f32> = (0..FFT_SIZE).map(|i| 0.5 - 0.5 * (2.0 * PI * i as f32 / (FFT_SIZE - 1) as f32).cos()).collect();
        let normalization = 2.0 / window.iter().sum::<f32>();
        let hz_per_bin = format.sample_rate as f32 / FFT_SIZE as f32;
        let half = ((16000.0f32 / 30.0).ln() / (BANDS - 1) as f32 * 0.5).exp();
        let band_bins = std::array::from_fn(|band| {
            let hz = 30.0 * (16000.0f32 / 30.0).powf(band as f32 / (BANDS - 1) as f32);
            if hz >= format.sample_rate as f32 * 0.5 { return (1, 0); }
            let low = (hz / half / hz_per_bin).floor().max(1.0) as usize;
            let high = ((hz * half / hz_per_bin).ceil() as usize).min(FFT_SIZE / 2 - 1);
            (low, high)
        });
        Ok(Self {
            format,
            // At most eight channels are analyzed; frame stride still includes all channels.
            ring: vec![vec![0.0; FFT_SIZE]; format.channels.min(8)],
            cursor: 0, filled: 0, pending: 0,
            // Preserve the 2048-sample frequency window for bass detail. Analyze
            // its newest overlap at most 100 times/sec, independent of sample rate.
            hop: (format.sample_rate as usize / 100).max(1), window,
            power_scale: normalization * normalization / format.channels.min(8) as f32,
            band_bins, all_power: [0.0; FFT_SIZE / 2],
            scratch: vec![Complex::default(); fft.get_inplace_scratch_len()],
            work: vec![Complex::default(); FFT_SIZE], fft,
        })
    }
    pub fn reset(&mut self) {
        for channel in &mut self.ring { channel.fill(0.0); }
        self.cursor = 0; self.filled = 0; self.pending = 0;
    }
    pub fn push(&mut self, bytes: &[u8], frames: usize, silent: bool) -> Option<Analysis> {
        if !silent && bytes.len() < frames.checked_mul(self.format.stride)? { return None; }
        for frame in 0..frames {
            for (channel, ring) in self.ring.iter_mut().enumerate() {
                let offset = frame * self.format.stride + channel * self.format.sample_bytes;
                ring[self.cursor] = if silent { 0.0 } else { self.format.decode(&bytes[offset..]) };
            }
            self.cursor = (self.cursor + 1) % FFT_SIZE;
        }
        self.filled = (self.filled + frames).min(FFT_SIZE);
        self.pending += frames;
        if self.filled < FFT_SIZE || self.pending < self.hop { return None; }
        self.pending = 0;
        Some(self.analyze())
    }
    fn analyze(&mut self) -> Analysis {
        let mut out = Analysis::default();
        self.all_power.fill(0.0);
        let mut strongest = 0;
        let mut strongest_energy = -1.0f32;
        let mut sum = 0.0;
        for (channel, ring) in self.ring.iter().enumerate() {
            let mut energy = 0.0;
            for i in 0..FFT_SIZE {
                let value = ring[(self.cursor + i) % FFT_SIZE];
                energy += value * value;
                self.work[i] = Complex::new(value * self.window[i], 0.0);
            }
            if energy > strongest_energy { strongest = channel; strongest_energy = energy; }
            sum += energy;
            self.fft.process_with_scratch(&mut self.work, &mut self.scratch);
            for (i, power) in self.all_power.iter_mut().enumerate() {
                *power += self.work[i].norm_sqr() * self.power_scale;
            }
        }
        // Power averaging preserves antiphase stereo. Never downmix L+R before FFT.
        out.rms = (sum / (FFT_SIZE * self.ring.len()) as f32).sqrt();
        for (band, &(low, high)) in self.band_bins.iter().enumerate() {
            if low <= high {
                out.power[band] = self.all_power[low..=high].iter().copied().fold(0.0f32, f32::max);
            }
        }
        for i in 0..WAVE { out.waveform[i] = self.ring[strongest][(self.cursor + i * FFT_SIZE / WAVE) % FFT_SIZE]; }
        out
    }
}

pub fn display_spectrum(power: f32) -> f32 {
    if !power.is_finite() || power <= 1e-12 { return 0.0; }
    ((10.0 * power.log10() + 72.0) / 65.0).clamp(0.0, 1.0)
}
pub fn display_level(rms: f32) -> f32 {
    if !rms.is_finite() { return 0.0; }
    (rms.max(0.0).sqrt() * 1.8).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn format(channels: usize) -> PcmFormat {
        PcmFormat { channels, sample_rate: 48000, stride: channels * 4, sample_bytes: 4, encoding: Encoding::Float32 }
    }
    fn signal(invert: bool) -> Analysis {
        let mut analyzer = Analyzer::new(format(2)).unwrap();
        let mut bytes = Vec::new();
        for i in 0..FFT_SIZE {
            let sample = (2.0 * PI * 1000.0 * i as f32 / 48000.0).sin() * 0.5;
            bytes.extend_from_slice(&sample.to_le_bytes());
            bytes.extend_from_slice(&(if invert { -sample } else { sample }).to_le_bytes());
        }
        analyzer.push(&bytes, FFT_SIZE, false).unwrap()
    }
    #[test]
    fn antiphase_stereo_does_not_cancel() {
        let a = signal(false); let b = signal(true);
        assert!((a.rms - b.rms).abs() < 1e-6);
        assert!(b.rms > 0.3);
        for (a, b) in a.power.iter().zip(&b.power) { assert!((a - b).abs() < 1e-6); }
    }
    #[test]
    fn sine_peak_is_near_one_kilohertz() {
        let a = signal(false);
        let index = a.power.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1)).unwrap().0;
        let hz = 30.0 * (16000.0f32 / 30.0).powf(index as f32 / 127.0);
        assert!((hz - 1000.0).abs() < 120.0, "peak: {hz}");
    }
    #[test]
    fn silence_and_bad_float_are_safe() {
        let mut analyzer = Analyzer::new(format(2)).unwrap();
        let result = analyzer.push(&[], FFT_SIZE, true).unwrap();
        assert_eq!(result.rms, 0.0);
        assert!(result.power.iter().all(|v| *v == 0.0));
        assert_eq!(format(1).decode(&f32::NAN.to_le_bytes()), 0.0);
        assert_eq!(display_spectrum(0.0), 0.0);
        assert_eq!(display_level(f32::NAN), 0.0);
    }
    #[test]
    fn signed_pcm_is_little_endian_and_sign_extended() {
        let mut f = format(1); f.sample_bytes = 3; f.encoding = Encoding::Signed24;
        assert_eq!(f.decode(&[0, 0, 128]), -1.0);
        assert!((f.decode(&[255, 255, 127]) - 1.0).abs() < 1e-6);
        f.sample_bytes = 2; f.encoding = Encoding::Signed16;
        assert_eq!(f.decode(&[0, 128]), -1.0);
        assert_eq!(f.decode(&[0, 64]), 0.5);
    }
    #[test]
    fn normal_ten_ms_packets_refresh_every_packet_after_warmup() {
        let mut analyzer = Analyzer::new(format(2)).unwrap();
        analyzer.push(&[], FFT_SIZE, true).unwrap();
        // A 48 kHz endpoint commonly delivers 480 frames. The old 512-frame
        // threshold skipped alternate packets, delaying analysis by another 10 ms.
        for _ in 0..8 { assert!(analyzer.push(&[], 480, true).is_some()); }
        analyzer.reset();
        assert!(analyzer.push(&[], 480, true).is_none());
    }
    #[test]
    fn very_high_sample_rates_do_not_multiply_analysis_work() {
        let mut pcm = format(2); pcm.sample_rate = 192000;
        let mut analyzer = Analyzer::new(pcm).unwrap();
        analyzer.push(&[], 3840, true).unwrap();
        for _ in 0..3 { assert!(analyzer.push(&[], 480, true).is_none()); }
        assert!(analyzer.push(&[], 480, true).is_some());
    }
    #[test]
    fn cached_bands_preserve_low_frequency_response_and_silent_reset() {
        let mut analyzer = Analyzer::new(format(1)).unwrap();
        let bytes: Vec<u8> = (0..FFT_SIZE)
            .flat_map(|i| ((2.0 * PI * 60.0 * i as f32 / 48000.0).sin() * 0.5).to_le_bytes())
            .collect();
        let response = analyzer.push(&bytes, FFT_SIZE, false).unwrap();
        assert!(response.power[5..30].iter().copied().fold(0.0f32, f32::max) > 0.15);
        assert!(response.power[90..].iter().all(|value| *value < 0.00001));
        analyzer.reset();
        let silence = analyzer.push(&[], FFT_SIZE, true).unwrap();
        assert_eq!(silence.rms, 0.0);
        assert!(silence.power.iter().all(|value| *value == 0.0));
    }
}
