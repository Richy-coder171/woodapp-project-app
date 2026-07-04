from __future__ import annotations

from .schemas import LineBox


def sort_lines(lines: list[LineBox]) -> list[LineBox]:
    return sorted(lines, key=lambda line: (line.column_index, line.row_index, line.y, line.x))
