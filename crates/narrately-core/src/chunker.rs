pub fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    let max_chars = max_chars.max(64);
    let mut chunks = Vec::new();
    let mut buffer = String::new();

    for paragraph in text.split("\n\n") {
        let paragraph = paragraph.trim();
        if paragraph.is_empty() {
            continue;
        }
        append_piece(paragraph, max_chars, &mut buffer, &mut chunks);
    }

    if !buffer.trim().is_empty() {
        chunks.push(buffer.trim().to_string());
    }

    chunks
}

fn append_piece(text: &str, max_chars: usize, buffer: &mut String, chunks: &mut Vec<String>) {
    if fits(buffer, text, 2, max_chars) {
        if !buffer.is_empty() {
            buffer.push_str("\n\n");
        }
        buffer.push_str(text);
        return;
    }

    flush_buffer(buffer, chunks);

    if text.len() <= max_chars {
        buffer.push_str(text);
        return;
    }

    let mut sentence = String::new();
    for part in text.split_inclusive(['.', '!', '?', '…']) {
        if sentence.len() + part.len() <= max_chars {
            sentence.push_str(part);
            continue;
        }

        flush_text(&mut sentence, chunks);
        sentence.push_str(part);
    }

    if !sentence.trim().is_empty() {
        append_words(&sentence, max_chars, buffer, chunks);
    }
}

fn append_words(text: &str, max_chars: usize, buffer: &mut String, chunks: &mut Vec<String>) {
    for word in text.split_whitespace() {
        if fits(buffer, word, 1, max_chars) {
            if !buffer.is_empty() {
                buffer.push(' ');
            }
            buffer.push_str(word);
        } else {
            flush_buffer(buffer, chunks);
            buffer.push_str(word);
        }
    }
}

fn fits(buffer: &str, piece: &str, separator_len: usize, max_chars: usize) -> bool {
    buffer.len() + piece.len() + usize::from(!buffer.is_empty()) * separator_len <= max_chars
}

fn flush_text(buffer: &mut String, chunks: &mut Vec<String>) {
    if !buffer.trim().is_empty() {
        chunks.push(std::mem::take(buffer).trim().to_string());
    }
}

fn flush_buffer(buffer: &mut String, chunks: &mut Vec<String>) {
    flush_text(buffer, chunks);
}

#[cfg(test)]
mod tests {
    use super::chunk_text;

    #[test]
    fn keeps_short_paragraphs_together() {
        let chunks = chunk_text("One.\n\nTwo.", 64);
        assert_eq!(chunks, vec!["One.\n\nTwo."]);
    }

    #[test]
    fn splits_long_text() {
        let text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.";
        let chunks = chunk_text(text, 64);
        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 64));
    }
}
