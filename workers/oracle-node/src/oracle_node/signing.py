"""EIP-712 report signing, docs/spec/oracle-v1.md section 4.

The type string and field order must match SiliquaOracle exactly; test-vectors/
oracle-signatures-v1.json (signed with viem, verified in Foundry) is what keeps them honest.
"""

import hashlib
from dataclasses import dataclass

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak

REPORT_FIELDS = [
    {"name": "indexId", "type": "bytes32"},
    {"name": "timestamp", "type": "uint64"},
    {"name": "value", "type": "uint256"},
    {"name": "sources", "type": "uint8"},
    {"name": "methodologyVersion", "type": "uint32"},
    {"name": "nonce", "type": "uint256"},
]
DOMAIN_FIELDS = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]


@dataclass(frozen=True)
class Report:
    index_id: str
    timestamp: int
    value: int
    sources: int
    methodology_version: int
    nonce: int


@dataclass(frozen=True)
class SignedReport:
    report: Report
    signature: str
    digest: str


def index_id_for(label: str) -> str:
    return "0x" + keccak(text=label).hex()


def encode_methodology(version: str) -> int:
    """Version "1.0" is 10000: major * 10000 + minor (spec section 4)."""
    major, _, minor = version.partition(".")
    if not (major.isdigit() and minor.isdigit()):
        raise ValueError(f"methodology version must look like '1.0', got {version!r}")
    return int(major) * 10_000 + int(minor)


def nonce_for(label: str, timestamp: int) -> int:
    # Derived from the slot, not from a counter: resending a slot gives the same signature,
    # which the report board answers as a duplicate, so the node needs no state to retry safely.
    return int.from_bytes(hashlib.sha256(f"{label}:{timestamp}".encode()).digest(), "big")


def sign_report(private_key: str, chain_id: int, oracle: str, report: Report) -> SignedReport:
    message = encode_typed_data(
        full_message={
            "types": {"EIP712Domain": DOMAIN_FIELDS, "Report": REPORT_FIELDS},
            "primaryType": "Report",
            "domain": {
                "name": "SiliquaOracle",
                "version": "1",
                "chainId": chain_id,
                "verifyingContract": oracle,
            },
            "message": {
                "indexId": report.index_id,
                "timestamp": report.timestamp,
                "value": report.value,
                "sources": report.sources,
                "methodologyVersion": report.methodology_version,
                "nonce": report.nonce,
            },
        }
    )
    signed = Account.sign_message(message, private_key)
    return SignedReport(
        report=report,
        signature="0x" + bytes(signed.signature).hex(),
        digest="0x" + bytes(signed.message_hash).hex(),
    )


def signer_address(private_key: str) -> str:
    return Account.from_key(private_key).address.lower()
