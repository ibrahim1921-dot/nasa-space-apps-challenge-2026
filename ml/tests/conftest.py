import pathlib
import sys

# Let tests import crewhealth_ml without installing the package.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
