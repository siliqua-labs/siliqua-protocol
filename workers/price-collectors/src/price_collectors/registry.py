from price_collectors.providers import (
    akash,
    hyperstack,
    lambda_labs,
    runpod,
    salad,
    tensordock,
    texel,
    vastai,
)
from price_collectors.runner import Provider

PROVIDERS = tuple(
    Provider(
        name=module.NAME, api_key_env=module.API_KEY_ENV, fetch=module.fetch, parse=module.parse
    )
    for module in (runpod, vastai, lambda_labs, texel, akash, hyperstack, tensordock, salad)
)
