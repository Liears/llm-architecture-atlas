import atlas_ingest
from pydantic import BaseModel


class Smoke(BaseModel):
    name: str
    layers: int


def test_version_is_semver() -> None:
    assert atlas_ingest.__version__ == "0.1.0"


def test_pydantic_models_validate() -> None:
    m = Smoke(name="glm-5.3-flash", layers=45)
    assert m.layers == 45
    try:
        Smoke(name="bad", layers="many")  # type: ignore[arg-type]
    except Exception as exc:  # pydantic.ValidationError
        assert "ValidationError" in type(exc).__name__
    else:
        raise AssertionError("expected validation failure")
