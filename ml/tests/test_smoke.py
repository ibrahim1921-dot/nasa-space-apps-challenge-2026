def test_package_imports():
    import importlib.util
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
    assert importlib.util.find_spec("crewhealth_ml") is not None
