pub fn validate_voice_embedding(values: &[f32]) -> String {
    if values.len() != 256 {
        return format!(
            "Voice embedding must contain 256 values, got {}.",
            values.len()
        );
    }
    if values.iter().any(|value| !value.is_finite()) {
        return "Voice embedding contains a non-finite value.".to_string();
    }
    String::new()
}
