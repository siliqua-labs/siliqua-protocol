from html.parser import HTMLParser


class _TextTokens(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[str] = []
        self._hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style"):
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._hidden_depth:
            return
        text = " ".join(data.replace("\xa0", " ").split())
        if text:
            self.tokens.append(text)


def visible_text_tokens(html: str) -> list[str]:
    """Visible text of a page as a flat list, one entry per text node."""
    parser = _TextTokens()
    parser.feed(html)
    parser.close()
    return parser.tokens
