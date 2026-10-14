use std::borrow::Cow;

const MIN_MAX_CHARS: usize = 64;

pub fn chunk_text(text: &str, max_chars: usize) -> Vec<Cow<'_, str>> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }

    let max_chars = max_chars.max(MIN_MAX_CHARS);
    if text.len() <= max_chars && !text.contains("\n\n") {
        return vec![Cow::Borrowed(text)];
    }

    let mut builder = ChunkBuilder::new(text, max_chars);
    for paragraph in text.split("\n\n") {
        let paragraph = paragraph.trim();
        if !paragraph.is_empty() {
            builder.append_paragraph(paragraph);
        }
    }

    builder.finish()
}

struct ChunkBuilder<'a> {
    source: &'a str,
    max_chars: usize,
    buffer: Cow<'a, str>,
    chunks: Vec<Cow<'a, str>>,
}

impl<'a> ChunkBuilder<'a> {
    fn new(source: &'a str, max_chars: usize) -> Self {
        Self {
            source,
            max_chars,
            buffer: Cow::Borrowed(""),
            chunks: Vec::with_capacity(source.len() / max_chars + 1),
        }
    }

    fn append_paragraph(&mut self, paragraph: &'a str) {
        if self.fits(paragraph.len(), 2) {
            self.push(paragraph, "\n\n");
            return;
        }

        if paragraph.len() <= self.max_chars {
            self.flush();
            self.buffer = Cow::Borrowed(paragraph);
            return;
        }

        let mut sep = "\n\n";
        for sentence in SentenceIter::new(paragraph) {
            if self.fits(sentence.len(), sep.len()) {
                self.push(sentence, sep);
            } else if sentence.len() <= self.max_chars {
                self.flush();
                self.buffer = Cow::Borrowed(sentence);
            } else {
                self.append_words(sentence, sep);
            }
            sep = " ";
        }
    }

    fn append_words(&mut self, text: &'a str, initial_sep: &str) {
        let mut sep = initial_sep;
        for word in text.split_whitespace() {
            if self.fits(word.len(), sep.len()) {
                self.push(word, sep);
            } else if word.len() <= self.max_chars {
                self.flush();
                self.buffer = Cow::Borrowed(word);
            } else {
                self.flush();
                let mut rest = word;
                while rest.len() > self.max_chars {
                    let split_at = floor_char_boundary(rest, self.max_chars);
                    self.chunks.push(Cow::Borrowed(&rest[..split_at]));
                    rest = &rest[split_at..];
                }
                if !rest.is_empty() {
                    self.buffer = Cow::Borrowed(rest);
                }
            }
            sep = " ";
        }
    }

    #[inline]
    fn fits(&self, piece_len: usize, sep_len: usize) -> bool {
        let extra = if self.buffer.is_empty() { 0 } else { sep_len };
        self.buffer.len() + extra + piece_len <= self.max_chars
    }

    fn push(&mut self, piece: &'a str, sep: &str) {
        if self.buffer.is_empty() {
            self.buffer = Cow::Borrowed(piece);
            return;
        }

        match &mut self.buffer {
            Cow::Borrowed(current) => {
                let base = self.source.as_ptr() as usize;
                let cur_start = current.as_ptr() as usize - base;
                let cur_end = cur_start + current.len();
                let piece_start = piece.as_ptr() as usize - base;
                let piece_end = piece_start + piece.len();

                // Extend slice in-place when `current`, `sep`, and `piece` are contiguous in `source`.
                if cur_end + sep.len() == piece_start
                    && self.source.get(cur_end..piece_start) == Some(sep)
                {
                    *current = &self.source[cur_start..piece_end];
                } else {
                    let mut owned = String::with_capacity(self.max_chars);
                    owned.push_str(current);
                    owned.push_str(sep);
                    owned.push_str(piece);
                    self.buffer = Cow::Owned(owned);
                }
            }
            Cow::Owned(owned) => {
                owned.push_str(sep);
                owned.push_str(piece);
            }
        }
    }

    #[inline]
    fn flush(&mut self) {
        if !self.buffer.is_empty() {
            self.chunks
                .push(std::mem::replace(&mut self.buffer, Cow::Borrowed("")));
        }
    }

    fn finish(mut self) -> Vec<Cow<'a, str>> {
        self.flush();
        self.chunks
    }
}

struct SentenceIter<'a> {
    rest: &'a str,
}

impl<'a> SentenceIter<'a> {
    fn new(text: &'a str) -> Self {
        Self { rest: text }
    }
}

impl<'a> Iterator for SentenceIter<'a> {
    type Item = &'a str;

    fn next(&mut self) -> Option<Self::Item> {
        let text = self.rest.trim_start();
        if text.is_empty() {
            self.rest = "";
            return None;
        }

        let mut chars = text.char_indices().peekable();
        while let Some((idx, ch)) = chars.next() {
            if is_sentence_terminator(ch) {
                let mut end = idx + ch.len_utf8();
                while let Some(&(next_idx, next_ch)) = chars.peek() {
                    if is_sentence_terminator(next_ch) || is_closing_delimiter(next_ch) {
                        end = next_idx + next_ch.len_utf8();
                        chars.next();
                    } else {
                        break;
                    }
                }
                if chars.peek().map_or(true, |&(_, next_ch)| next_ch.is_whitespace()) {
                    let sentence = text[..end].trim_end();
                    self.rest = &text[end..];
                    if !sentence.is_empty() {
                        return Some(sentence);
                    }
                }
            }
        }

        self.rest = "";
        let tail = text.trim_end();
        (!tail.is_empty()).then_some(tail)
    }
}

#[inline]
fn is_sentence_terminator(ch: char) -> bool {
    matches!(ch, '.' | '!' | '?' | '…')
}

#[inline]
fn is_closing_delimiter(ch: char) -> bool {
    matches!(ch, '"' | '\'' | '”' | '’' | ')' | ']' | '}')
}

fn floor_char_boundary(text: &str, max_bytes: usize) -> usize {
    if max_bytes >= text.len() {
        return text.len();
    }
    let mut index = max_bytes;
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    if index == 0 {
        text.chars().next().map_or(0, char::len_utf8)
    } else {
        index
    }
}

#[cfg(test)]
mod tests {
    use super::chunk_text;
    use std::borrow::Cow;

    #[test]
    fn keeps_short_paragraphs_together() {
        let chunks = chunk_text("One.\n\nTwo.", 64);
        assert_eq!(chunks, vec!["One.\n\nTwo."]);
        assert!(matches!(chunks.as_slice(), [Cow::Borrowed("One.\n\nTwo.")]));
    }

    #[test]
    fn splits_long_text() {
        let text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.";
        let chunks = chunk_text(text, 64);
        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 64));
    }

    #[test]
    fn splits_non_final_oversized_sentence() {
        let text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen. Short end.";
        let chunks = chunk_text(text, 64);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 64));
    }

    #[test]
    fn splits_oversized_single_word_on_char_boundaries() {
        let text = "é".repeat(50);
        let chunks = chunk_text(&text, 64);
        assert_eq!(chunks.len(), 2);
        assert!(chunks.iter().all(|chunk| chunk.len() <= 64));
    }
}
