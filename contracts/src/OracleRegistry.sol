// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// Lists the approved deployments of the oracle and the factory. Contracts are not upgradeable:
/// a new version is a new deployment, appended here by the admin (a timelock owned by the multisig).
/// Entries are never removed, so the history of what was approved stays readable.
contract OracleRegistry {
    bytes32 public constant ORACLE = keccak256("oracle");
    bytes32 public constant FACTORY = keccak256("factory");

    address public admin;
    mapping(bytes32 => address[]) private _versions;

    event Registered(bytes32 indexed kind, address indexed deployment, uint256 version);
    event AdminChanged(address admin);

    error NotAdmin();
    error ZeroAddress();
    error NotAContract();
    error NoDeployment();

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    function register(bytes32 kind, address deployment) external returns (uint256 version) {
        if (msg.sender != admin) revert NotAdmin();
        if (deployment.code.length == 0) revert NotAContract();
        _versions[kind].push(deployment);
        version = _versions[kind].length;
        emit Registered(kind, deployment, version);
    }

    function transferAdmin(address admin_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        emit AdminChanged(admin_);
    }

    function current(bytes32 kind) external view returns (address) {
        uint256 n = _versions[kind].length;
        if (n == 0) revert NoDeployment();
        return _versions[kind][n - 1];
    }

    function count(bytes32 kind) external view returns (uint256) {
        return _versions[kind].length;
    }

    /// `version` starts at 1.
    function at(bytes32 kind, uint256 version) external view returns (address) {
        return _versions[kind][version - 1];
    }
}
