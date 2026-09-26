//! Conservative integer coverage for an antialiased 8 logical-pixel surface.
//!
//! A Win32 region has binary coverage. The webview's full-resolution CSS clip
//! supplies smooth alpha; the host region removes only pixel squares wholly
//! outside that clip. This prevents the region from chopping its antialias fringe.

pub const RADIUS_LOGICAL: f64 = 8.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Band {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

pub fn radius_for_scale(scale: f64, width: i32, height: i32) -> f64 {
    let scale = if scale.is_finite() && scale > 0.0 { scale.clamp(0.5, 8.0) } else { 1.0 };
    (RADIUS_LOGICAL * scale).min(width.min(height).max(0) as f64 * 0.5)
}

/// Number of wholly excluded pixels at the left edge of this row. Sampling
/// the row's far edge is conservative: any partially covered pixel is retained.
fn inset_at_row(y: i32, radius: f64) -> i32 {
    let vertical = (radius - (y + 1) as f64).max(0.0);
    let boundary = radius - (radius * radius - vertical * vertical).max(0.0).sqrt();
    boundary.floor().max(0.0) as i32
}

pub fn bands(width: i32, height: i32, radius: f64) -> Vec<Band> {
    if width <= 0 || height <= 0 { return Vec::new(); }
    let radius = if radius.is_finite() { radius.clamp(0.0, width.min(height) as f64 * 0.5) } else { 0.0 };
    let rows = radius.ceil() as i32;
    let mut result = Vec::with_capacity((rows * 2 + 1).max(1) as usize);
    for y in 0..rows {
        let inset = inset_at_row(y, radius);
        result.push(Band { left: inset, top: y, right: width - inset, bottom: y + 1 });
        if height - 1 - y != y {
            result.push(Band { left: inset, top: height - 1 - y, right: width - inset, bottom: height - y });
        }
    }
    if height - rows > rows || rows == 0 {
        result.push(Band { left: 0, top: rows, right: width, bottom: height - rows });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn contains(bands: &[Band], x: i32, y: i32) -> bool {
        bands.iter().any(|b| x >= b.left && x < b.right && y >= b.top && y < b.bottom)
    }
    #[test]
    fn radius_tracks_dpi_not_focus_or_render_quality() {
        assert_eq!(radius_for_scale(1.0, 640, 600), 8.0);
        assert_eq!(radius_for_scale(1.25, 640, 600), 10.0);
        assert_eq!(radius_for_scale(1.5, 640, 600), 12.0);
        assert_eq!(radius_for_scale(2.0, 640, 600), 16.0);
        assert_eq!(radius_for_scale(f64::NAN, 640, 600), 8.0);
    }
    #[test]
    fn all_four_outside_corners_are_removed_and_straight_edges_survive() {
        for scale in [1.0, 1.25, 1.5, 2.0, 3.0] {
            let radius = radius_for_scale(scale, 640, 600);
            let shape = bands(640, 600, radius);
            for (x,y) in [(0,0),(639,0),(0,599),(639,599)] { assert!(!contains(&shape,x,y)); }
            for (x,y) in [(320,0),(320,599),(0,300),(639,300),(320,300)] { assert!(contains(&shape,x,y)); }
            // Every pixel square that intersects the circle must be retained.
            for y in 0..radius.ceil() as i32 {
                for x in 0..radius.ceil() as i32 {
                    let dx=(radius-(x+1) as f64).max(0.0);
                    let dy=(radius-(y+1) as f64).max(0.0);
                    if dx*dx+dy*dy < radius*radius {
                        assert!(contains(&shape,x,y), "AA fringe clipped: {scale}, {x},{y}");
                    }
                    assert_eq!(contains(&shape,x,y),contains(&shape,639-x,y));
                    assert_eq!(contains(&shape,x,y),contains(&shape,x,599-y));
                }
            }
        }
    }
    #[test]
    fn square_and_tiny_dimensions_are_safe() {
        assert_eq!(bands(0,600,8.0), Vec::<Band>::new());
        assert_eq!(bands(640,600,0.0), vec![Band {left:0,top:0,right:640,bottom:600}]);
        for size in 1..20 {
            let b=bands(size,size,8.0);
            assert!(contains(&b,size/2,size/2));
            assert!(b.iter().all(|r|r.left>=0 && r.right<=size && r.top>=0 && r.bottom<=size));
        }
    }
}
