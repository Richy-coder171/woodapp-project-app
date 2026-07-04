from layout import arrange_detections


def item(x, y, text="4 x 36"):
    return {
        "rawText": text,
        "normalizedText": text,
        "confidence": 0.9,
        "selected": True,
        "box": {"x": x, "y": y, "width": 80, "height": 30},
        "normalizedBox": {},
        "parsedValues": {},
    }


def test_one_column_orders_top_to_bottom():
    arranged = arrange_detections([item(100, 220), item(100, 20), item(100, 120)], 900, 1200)
    assert [entry["rowIndex"] for entry in arranged] == [0, 1, 2]
    assert [entry["box"]["y"] for entry in arranged] == [20, 120, 220]


def test_four_columns_are_grouped_left_to_right_then_top_to_bottom():
    detections = []
    for row in range(10):
        for column in range(4):
            detections.append(item(60 + column * 210, 40 + row * 75))

    arranged = arrange_detections(list(reversed(detections)), 1000, 1000)
    assert len(arranged) == 40
    assert arranged[0]["columnIndex"] == 0
    assert arranged[0]["rowIndex"] == 0
    assert arranged[9]["columnIndex"] == 0
    assert arranged[9]["rowIndex"] == 9
    assert arranged[10]["columnIndex"] == 1
    assert arranged[39]["columnIndex"] == 3
    assert all(entry["selected"] is True for entry in arranged)


def test_similar_y_positions_do_not_merge_columns():
    arranged = arrange_detections([item(70, 100), item(370, 102), item(670, 98)], 900, 500)
    assert [entry["columnIndex"] for entry in arranged] == [0, 1, 2]
