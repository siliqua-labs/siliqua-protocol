import pytest
from index_engine.config import ConfigError, load_settings


def test_database_url_is_required():
    with pytest.raises(ConfigError, match="DATABASE_URL"):
        load_settings({})


def test_interval_defaults_to_five_minutes():
    assert load_settings({"DATABASE_URL": "postgresql://x"}).interval_seconds == 300


@pytest.mark.parametrize("bad", ["soon", "", "30"])
def test_bad_interval_fails_clearly(bad):
    with pytest.raises(ConfigError, match="ENGINE_INTERVAL_SECONDS"):
        load_settings({"DATABASE_URL": "postgresql://x", "ENGINE_INTERVAL_SECONDS": bad})
