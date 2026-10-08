mod cache_key;
mod chunker;
mod types;
mod voice_packs;
mod voices;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn chunk_text(text: &str, max_chars: usize) -> String {
    serde_json::to_string(&chunker::chunk_text(text, max_chars))
        .unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn build_cache_key(text: &str, voice_id: &str, speed: f32) -> String {
    cache_key::build_cache_key(text, voice_id, speed)
}

#[wasm_bindgen]
pub fn default_voice_catalog() -> String {
    serde_json::to_string(&voices::default_voice_catalog()).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn validate_synthesis_request(text: &str, voice_id: &str, speed: f32) -> String {
    if text.trim().is_empty() {
        return "Narration text is empty.".to_string();
    }
    if voice_id.trim().is_empty() {
        return "A voice is required.".to_string();
    }
    if !voices::contains_voice(voice_id) {
        return format!("Unknown voice: {voice_id}.");
    }
    if !(0.5..=2.0).contains(&speed) {
        return "Speed must be between 0.5 and 2.0.".to_string();
    }
    String::new()
}

#[wasm_bindgen]
pub fn validate_voice_embedding(values: &[f32]) -> String {
    voice_packs::validate_voice_embedding(values)
}
