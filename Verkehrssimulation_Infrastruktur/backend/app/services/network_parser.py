import xml.etree.ElementTree as ET
from pathlib import Path

def parse_lanes_to_geojson(net_file: Path):
    tree = ET.parse(net_file)
    root = tree.getroot()

    features = []

    for edge in root.findall("edge"):
        # interne Kanten erstmal ignorieren
        if edge.get("function") == "internal":
            continue

        for lane in edge.findall("lane"):
            shape = lane.get("shape")
            if not shape:
                continue

            coords = []
            for pair in shape.split(" "):
                x, y = pair.split(",")
                # SUMO = lokales Koordinatensystem
                coords.append([float(x), float(y)])

            features.append({
                "type": "Feature",
                "properties": {
                    "edge": edge.get("id"),
                    "lane": lane.get("id"),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
            })

    return {
        "type": "FeatureCollection",
        "features": features,
    }
