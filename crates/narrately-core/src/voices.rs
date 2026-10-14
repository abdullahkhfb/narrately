use crate::types::VoiceProfile;

const VOICE_SPECS: [(&str, &str, &str, &str, &str); 11] = [
    (
        "af_heart",
        "Heart",
        "Warm American female narration.",
        "en-US",
        "voices/af_heart.bin",
    ),
    (
        "af_bella",
        "Bella",
        "Expressive American female narration.",
        "en-US",
        "voices/af_bella.bin",
    ),
    (
        "af_nicole",
        "Nicole",
        "Clear American female narration.",
        "en-US",
        "voices/af_nicole.bin",
    ),
    (
        "af_sarah",
        "Sarah",
        "Gentle American female narration.",
        "en-US",
        "voices/af_sarah.bin",
    ),
    (
        "af_sky",
        "Sky",
        "Light American female narration.",
        "en-US",
        "voices/af_sky.bin",
    ),
    (
        "am_adam",
        "Adam",
        "Neutral American male narration.",
        "en-US",
        "voices/am_adam.bin",
    ),
    (
        "am_michael",
        "Michael",
        "Steady American male narration.",
        "en-US",
        "voices/am_michael.bin",
    ),
    (
        "bf_emma",
        "Emma",
        "British female narration.",
        "en-GB",
        "voices/bf_emma.bin",
    ),
    (
        "bf_isabella",
        "Isabella",
        "Polished British female narration.",
        "en-GB",
        "voices/bf_isabella.bin",
    ),
    (
        "bm_george",
        "George",
        "British male narration.",
        "en-GB",
        "voices/bm_george.bin",
    ),
    (
        "bm_lewis",
        "Lewis",
        "Measured British male narration.",
        "en-GB",
        "voices/bm_lewis.bin",
    ),
];

pub fn default_voice_catalog() -> Vec<VoiceProfile> {
    VOICE_SPECS
        .iter()
        .map(|&(id, name, description, language, asset_path)| VoiceProfile {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            language: language.to_string(),
            kind: "preset".to_string(),
            asset_path: Some(asset_path.to_string()),
        })
        .collect()
}

pub fn contains_voice(voice_id: &str) -> bool {
    VOICE_SPECS.iter().any(|&(id, ..)| id == voice_id)
}

#[cfg(test)]
mod tests {
    use super::{contains_voice, default_voice_catalog};

    #[test]
    fn catalog_contains_curated_voices() {
        assert_eq!(default_voice_catalog().len(), 11);
        assert!(contains_voice("af_heart"));
        assert!(contains_voice("bm_george"));
        assert!(!contains_voice("unknown"));
    }
}
