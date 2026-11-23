import pytest
from price_collectors.config import load_settings
from price_collectors.runner import ConfigError


def test_database_url_is_required():
    with pytest.raises(ConfigError, match="DATABASE_URL"):
        load_settings({})


def test_interval_defaults_to_ten_minutes():
    assert load_settings({"DATABASE_URL": "postgresql://x"}).interval_seconds == 600


def test_interval_is_read_from_the_environment():
    settings = load_settings({"DATABASE_URL": "postgresql://x", "COLLECT_INTERVAL_SECONDS": "120"})
    assert settings.interval_seconds == 120


@pytest.mark.parametrize("bad", ["ten", "", "59", "-5"])
def test_bad_interval_fails_clearly(bad):
    with pytest.raises(ConfigError, match="COLLECT_INTERVAL_SECONDS"):
        load_settings({"DATABASE_URL": "postgresql://x", "COLLECT_INTERVAL_SECONDS": bad})
