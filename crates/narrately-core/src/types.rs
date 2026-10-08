use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct VoiceProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub language: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_path: Option<String>,
}
