# Health, display care and resource use

Vsualize contains flashing light, high-contrast patterns and moving imagery. These can cause discomfort, headaches, dizziness or seizures, including in people without a known history. **Stop immediately if symptoms occur**, including visual trails or afterimages. Seek medical advice for persistent or recurring visual disturbances. Sudden vision changes, eye pain or vision loss warrant urgent medical assessment. See the [Epilepsy Foundation's photosensitivity guidance](https://www.epilepsy.com/what-is-epilepsy/seizure-triggers/photosensitivity) and [NHS vision guidance](https://www.nhs.uk/conditions/vision-loss/).

Use comfortable screen brightness, keep room lighting on, avoid prolonged viewing and take breaks. No combination of settings is guaranteed safe for every person. Do not use repeated exposure to test whether an effect still causes symptoms.

## Sessions and Stop

Safety & performance defaults to a 30-minute session, including after upgrading from a version without session controls. Choose 15, 30, 60 or 120 minutes. These are product precautions, **not established safe viewing durations**.

The timer begins on startup after the first-run notice, or on explicit Resume. Changing effects, moving the window and reconnecting audio do not reset it. Changing the duration uses the original session start. Minimized/hidden time counts toward the deadline.

Stop (formerly Pause), Space on the canvas, the native tray action and expiration all stop drawing and capture, cancel shader preparation and clear the window to opaque black. The window stays open in place. A subdued Resume control hides after ten seconds of inactivity. Interaction reveals controls; only an explicit Resume restarts a stopped session.

Hidden/minimized windows suspend drawing and capture, and restore only when their session is still active. Sleep or workstation lock stops the native session and requires explicit Resume. The browser preview also stops on a long visible scheduling interruption; browsers do not expose a reliable workstation-lock notification. A native timer controls the capture deadline independently of browser animation callbacks. These mechanisms do not guarantee operation during an OS, driver or process failure.

Unlimited requires a separate acknowledgement and is remembered locally across launches. “Automatic stop disabled” remains visible in settings. It does not bypass manual Stop, lock/sleep stops or reduced-motion startup. Choose a finite duration again to restore the cutoff. Portable effect profiles cannot enable Unlimited or acknowledge notices.

## Gentler and Eco

Gentler visuals lowers effective intensity and glow, softens reaction, disables idle drift and holds palette cycling. It is a rendering overlay: saved profiles and exports keep their original values. It does not guarantee elimination of flashes or uncomfortable patterns. Reduced-motion users start stopped and are offered Gentler.

Eco selects Auto quality and 30 fps. The normal default remains Auto/60. Lower frame rates and resolution can reduce rendering work, but the result depends on the effect, window size, display and hardware. Neither Eco nor Gentler is a medical safety mode.

GPU utilization is not temperature or power draw. Vsualize does not measure component temperature, change clocks/fans, install hardware drivers or promise protection against overheating. Follow your hardware manufacturer's operating guidance and investigate unusual heat, instability or fan behavior.

## OLED and other displays

Long sessions and static imagery can contribute to OLED image retention or burn-in. Moving visuals are not a guarantee against wear. Follow your display manufacturer's guidance for brightness, panel maintenance and sleep. Keep Windows display sleep enabled; Vsualize does not request that the monitor stay awake or change your power settings.

Stopping Vsualize clears **its window only**. It does not turn off the monitor, dim other applications, protect taskbars or control the entire screen. See [Dell's OLED image-retention guidance](https://www.dell.com/support/kbdoc/en-kw/000208280/image-retention-or-burn-in-on-the-alienware-aw3423dw-or-aw3423dwf-oled-gaming-monitors).

## Privacy and security

Audio is analyzed locally and is not uploaded, saved as a recording or played through the speakers. Selected device identifiers and settings are stored locally. Copy diagnostics is a user action and may include device/status information. The installed app contacts GitHub/CDN services for update checks and downloads; WebView2 installation may contact Microsoft. Local audio processing does not mean the application never uses the network.

See the [security policy](../../SECURITY.md), [verification record](../reports/safety-verification.md) and [dependency advisory notes](../reports/dependency-security.md).

## Limits and release review

Warnings, acknowledgements, timers and rendering controls are risk-reduction measures, not medical advice or guarantees against injury, device damage or legal claims. Assess recordings against [W3C flash guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html); sampled recordings cannot certify every input, configuration, display or generated sequence.

Before distributing claims about safety, obtain appropriate evidence and have qualified counsel review licensing, terms, disclaimers and distribution markets. No legal waiver or liability limitation is created by the Start button. [FTC guidance on substantiating safety claims](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business).
