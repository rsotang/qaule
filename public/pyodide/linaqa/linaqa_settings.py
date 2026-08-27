"""
Parámetros por defecto del servicio QAULE, portados de settingsunit.py de
LinaQA (sin dependencias de PyQt5). Se usa desde los scripts de análisis
para configurar tolerancias, MLC, phantoms, etc.
"""

DEFAULTS = {
    "General": {"Metadata": {"Physicist": "", "Linac": ""}},
    "3D Phantoms": {
        "3D Type": "CatPhan604",
        "HU Tolerance": "40",
        "Thickness Tolerance": "0.2",
        "Scaling Tolerance": "1",
    },
    "Picket Fence": {
        "MLC Type": "HD Millennium",
        "MLC Separate Leaves Type": "HD Millennium",
        "Leaf Tolerance": "0.5",
        "Leaf Action": "0.25",
        "Number of pickets": "10",
        "Apply median filter": "False",
    },
    "Star shot": {
        "DPI": "76",
        "SID": "1000",
        "Normalised analysis radius": "0.85",
        "Tolerance": "1",
        "Recursive analysis": "False",
    },
    "VMAT": {"VMAT test": "DRGS", "Tolerance": "1.5"},
    "Winston-Lutz": {"BB Size": "5", "Open field": "False", "Low density BB": "False"},
    "2D Phantoms": {
        "2D Type": "Leeds",
        "Low contrast threshold": "0.1",
        "High contrast threshold": "0.5",
        "Angle override": "0",
        "Center override": "0",
        "Size override": "0",
        "SSD": "1000",
    },
    "Gamma Analysis": {
        "Dose to agreement": "2.0",
        "Distance to agreement": "2.0",
        "Gamma cap": "2.0",
        "Global dose": "True",
        "Dose threshold": "0.05",
    },
    "PyDicom": {"Force": "False", "Scale factor": "1.0"},
    "Tomographic Uniformity": {
        "First frame": "0",
        "Last frame": "-1",
        "UFOV ratio": "0.80",
        "CFOV ratio": "0.75",
        "Center ratio": "0.4",
        "Threshold": "0.75",
        "Window size": "5",
    },
    "Simple Sensitivity": {"Nuclide": "Tc99m", "Activity MBq": "40.0"},
    "Spatial Resolution": {
        "Resolution test": "Four Bar",
        "Separation mm": "100.0",
        "ROI width mm": "10.0",
        "Bar widths mm": "(4.23, 3.18, 2.54, 2.12)",
        "ROI diameter mm": "70.0",
        "Distance from center mm": "130",
    },
    "Tomographic Contrast": {
        "Sphere diameters mm": "(38, 31.8, 25.4, 19.1, 15.9, 12.7)",
        "Sphere angles": "(-10, -70, -130, -190, 110, 50)",
        "UFOV ratio": "0.8",
        "Search window px": "5",
        "Search slices": "3",
    },
}


def get(group: str, key: str):
    """Devuelve el valor por defecto de un parámetro del servicio."""
    return DEFAULTS.get(group, {}).get(key)
