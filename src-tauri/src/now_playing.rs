use serde::Serialize;

#[derive(Serialize)]
pub struct NowPlaying {
    title: String,
    artist: String,
}

#[tauri::command]
pub async fn get_now_playing() -> Result<Option<NowPlaying>, String> {
    read().await.map_err(|error| error.to_string())
}

#[cfg(windows)]
async fn read() -> windows::core::Result<Option<NowPlaying>> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    // Windows may have no media session (microphone audio, for example).
    let session = match manager.GetCurrentSession() {
        Ok(session) => session,
        Err(_) => return Ok(None),
    };
    let properties = session.TryGetMediaPropertiesAsync()?.await?;
    let title = properties.Title()?.to_string().trim().to_owned();
    let artist = properties.Artist()?.to_string().trim().to_owned();
    if title.is_empty() && artist.is_empty() {
        return Ok(None);
    }
    Ok(Some(NowPlaying { title, artist }))
}

#[cfg(not(windows))]
async fn read() -> Result<Option<NowPlaying>, String> {
    Ok(None)
}
