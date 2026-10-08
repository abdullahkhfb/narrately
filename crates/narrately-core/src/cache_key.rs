use sha2::{Digest, Sha256};

pub fn build_cache_key(text: &str, voice_id: &str, speed: f32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.update([0]);
    hasher.update(voice_id.as_bytes());
    hasher.update([0]);
    hasher.update(speed.to_le_bytes());
    format!("nr-{:x}", hasher.finalize())
}
