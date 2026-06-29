from __future__ import annotations


def greedy_ctc_decode(indices: list[int], vocabulary: str, blank_index: int = 0) -> str:
    output = []
    previous = None
    for index in indices:
        if index == blank_index:
            previous = index
            continue
        if index == previous:
            continue
        char_index = index - 1
        if 0 <= char_index < len(vocabulary):
            output.append(vocabulary[char_index])
        previous = index
    return "".join(output)
