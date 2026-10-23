"""Scale-marker check on synthetic geometry."""
from bench import scale

COLORS = ["rgb(1,1,1)", "rgb(2,2,2)", "rgb(3,3,3)", "rgb(4,4,4)"]


def snap(marker_x, bar_y=100, with_bar=True):
    items = []
    if with_bar:  # 4 segments of 100 px: under, normal, over, obese
        items += [{"key": f"0/{i}", "tag": "div", "x": 100 * i, "y": bar_y, "w": 100, "h": 12, "fill": c, "text": "",
                   "opacity": 1} for i, c in enumerate(COLORS)]
    items.append({"key": "1", "tag": "polygon", "x": marker_x - 5, "y": bar_y - 12, "w": 10, "h": 10, "fill": "rgb(0,0,0)", "text": "", "opacity": 1})
    items.append({"key": "2", "tag": "span", "x": 0, "y": 20, "w": 40, "h": 20, "fill": None, "text": "BMI"})
    return items


BMIS = ["22.9", "17.6", "23.1", "27.7", "34.9"]


def test_correct_marker():
    r = scale.check([snap(x) for x in (150, 50, 160, 250, 350)], BMIS)
    assert r["status"] == "ok" and r["correct"] == 5


def test_marker_in_wrong_segment():
    r = scale.check([snap(x) for x in (40, 10, 45, 80, 95)], BMIS)  # squeezed into the first segment
    assert r["status"] == "wrong" and r["correct"] == 1
    assert [p["shown"] for p in r["positions"]][:2] == ["underweight", "underweight"]


def test_not_checkable():
    assert scale.check([snap(150, with_bar=False), snap(50, with_bar=False)], BMIS[:2])["status"] == "not_checkable"
    assert scale.check([snap(150), snap(150)], BMIS[:2])["status"] == "static"


def test_restyled_segment_is_not_a_defect():
    a, b = snap(150), snap(150)
    b[1]["opacity"] = 0.4  # active segment restyled, no marker movement
    assert scale.check([a, b], BMIS[:2])["status"] == "not_checkable"
