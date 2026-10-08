use crate::types::VoiceProfile;

pub fn default_voice_catalog() -> Vec<VoiceProfile> {
    vec![
        preset(
            "af_heart",
            "Heart",
            "Warm American female narration.",
            "en-US",
            "voices/af_heart.bin",
        ),
        preset(
            "af_bella",
            "Bella",
            "Expressive American female narration.",
            "en-US",
            "voices/af_bella.bin",
        ),
        preset(
            "af_nicole",
            "Nicole",
            "Clear American female narration.",
            "en-US",
            "voices/af_nicole.bin",
        ),
        preset(
            "af_sarah",
            "Sarah",
            "Gentle American female narration.",
            "en-US",
            "voices/af_sarah.bin",
        ),
        preset(
            "af_sky",
            "Sky",
            "Light American female narration.",
            "en-US",
            "voices/af_sky.bin",
        ),
        preset(
            "am_adam",
            "Adam",
            "Neutral American male narration.",
            "en-US",
            "voices/am_adam.bin",
        ),
        preset(
            "am_michael",
            "Michael",
            "Steady American male narration.",
            "en-US",
            "voices/am_michael.bin",
        ),
        preset(
            "bf_emma",
            "Emma",
            "British female narration.",
            "en-GB",
            "voices/bf_emma.bin",
        ),
        preset(
            "bf_isabella",
            "Isabella",
            "Polished British female narration.",
            "en-GB",
            "voices/bf_isabella.bin",
        ),
        preset(
            "bm_george",
            "George",
            "British male narration.",
            "en-GB",
            "voices/bm_george.bin",
        ),
        preset(
            "bm_lewis",
            "Lewis",
            "Measured British male narration.",
            "en-GB",
            "voices/bm_lewis.bin",
        ),
    ]
}

pub fn contains_voice(voice_id: &str) -> bool {
    default_voice_catalog()
        .iter()
        .any(|voice| voice.id == voice_id)
}

fn preset(
    id: &str,
    name: &str,
    description: &str,
    language: &str,
    asset_path: &str,
) -> VoiceProfile {
    VoiceProfile {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        language: language.to_string(),
        kind: "preset".to_string(),
        asset_path: Some(asset_path.to_string()),
    }
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
