export const PKP_PERMISSIONS_ABI = [
    {
        "inputs": [],
        "name": "CallerNotOwner",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "newResolverAddress",
                "type": "address"
            }
        ],
        "name": "ContractResolverAddressSet",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "userPubkey",
                "type": "bytes"
            }
        ],
        "name": "PermittedAuthMethodAdded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "PermittedAuthMethodRemoved",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "scopeId",
                "type": "uint256"
            }
        ],
        "name": "PermittedAuthMethodScopeAdded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "scopeId",
                "type": "uint256"
            }
        ],
        "name": "PermittedAuthMethodScopeRemoved",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "group",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "root",
                "type": "bytes32"
            }
        ],
        "name": "RootHashUpdated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "newTrustedForwarder",
                "type": "address"
            }
        ],
        "name": "TrustedForwarderSet",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "ipfsCID",
                "type": "bytes"
            },
            {
                "internalType": "uint256[]",
                "name": "scopes",
                "type": "uint256[]"
            }
        ],
        "name": "addPermittedAction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "user",
                "type": "address"
            },
            {
                "internalType": "uint256[]",
                "name": "scopes",
                "type": "uint256[]"
            }
        ],
        "name": "addPermittedAddress",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "authMethodType",
                        "type": "uint256"
                    },
                    {
                        "internalType": "bytes",
                        "name": "id",
                        "type": "bytes"
                    },
                    {
                        "internalType": "bytes",
                        "name": "userPubkey",
                        "type": "bytes"
                    }
                ],
                "internalType": "struct LibPKPPermissionsStorage.AuthMethod",
                "name": "authMethod",
                "type": "tuple"
            },
            {
                "internalType": "uint256[]",
                "name": "scopes",
                "type": "uint256[]"
            }
        ],
        "name": "addPermittedAuthMethod",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "scopeId",
                "type": "uint256"
            }
        ],
        "name": "addPermittedAuthMethodScope",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256[]",
                "name": "permittedAuthMethodTypesToAdd",
                "type": "uint256[]"
            },
            {
                "internalType": "bytes[]",
                "name": "permittedAuthMethodIdsToAdd",
                "type": "bytes[]"
            },
            {
                "internalType": "bytes[]",
                "name": "permittedAuthMethodPubkeysToAdd",
                "type": "bytes[]"
            },
            {
                "internalType": "uint256[][]",
                "name": "permittedAuthMethodScopesToAdd",
                "type": "uint256[][]"
            },
            {
                "internalType": "uint256[]",
                "name": "permittedAuthMethodTypesToRemove",
                "type": "uint256[]"
            },
            {
                "internalType": "bytes[]",
                "name": "permittedAuthMethodIdsToRemove",
                "type": "bytes[]"
            }
        ],
        "name": "batchAddRemoveAuthMethods",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "getAuthMethodId",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "getEthAddress",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "getPKPPubKeysByAuthMethod",
        "outputs": [
            {
                "internalType": "bytes[]",
                "name": "",
                "type": "bytes[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "getPermittedActions",
        "outputs": [
            {
                "internalType": "bytes[]",
                "name": "",
                "type": "bytes[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "getPermittedAddresses",
        "outputs": [
            {
                "internalType": "address[]",
                "name": "",
                "type": "address[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "maxScopeId",
                "type": "uint256"
            }
        ],
        "name": "getPermittedAuthMethodScopes",
        "outputs": [
            {
                "internalType": "bool[]",
                "name": "",
                "type": "bool[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "getPermittedAuthMethods",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "authMethodType",
                        "type": "uint256"
                    },
                    {
                        "internalType": "bytes",
                        "name": "id",
                        "type": "bytes"
                    },
                    {
                        "internalType": "bytes",
                        "name": "userPubkey",
                        "type": "bytes"
                    }
                ],
                "internalType": "struct LibPKPPermissionsStorage.AuthMethod[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getPkpNftAddress",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "getPubkey",
        "outputs": [
            {
                "internalType": "bytes",
                "name": "",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getRouterAddress",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "getTokenIdsForAuthMethod",
        "outputs": [
            {
                "internalType": "uint256[]",
                "name": "",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getTrustedForwarder",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "getUserPubkeyForAuthMethod",
        "outputs": [
            {
                "internalType": "bytes",
                "name": "",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "ipfsCID",
                "type": "bytes"
            }
        ],
        "name": "isPermittedAction",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "user",
                "type": "address"
            }
        ],
        "name": "isPermittedAddress",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "isPermittedAuthMethod",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "scopeId",
                "type": "uint256"
            }
        ],
        "name": "isPermittedAuthMethodScopePresent",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "ipfsCID",
                "type": "bytes"
            }
        ],
        "name": "removePermittedAction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "user",
                "type": "address"
            }
        ],
        "name": "removePermittedAddress",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            }
        ],
        "name": "removePermittedAuthMethod",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "authMethodType",
                "type": "uint256"
            },
            {
                "internalType": "bytes",
                "name": "id",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "scopeId",
                "type": "uint256"
            }
        ],
        "name": "removePermittedAuthMethodScope",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "newResolverAddress",
                "type": "address"
            }
        ],
        "name": "setContractResolver",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "group",
                "type": "uint256"
            },
            {
                "internalType": "bytes32",
                "name": "root",
                "type": "bytes32"
            }
        ],
        "name": "setRootHash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "forwarder",
                "type": "address"
            }
        ],
        "name": "setTrustedForwarder",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "group",
                "type": "uint256"
            },
            {
                "internalType": "bytes32[]",
                "name": "proof",
                "type": "bytes32[]"
            },
            {
                "internalType": "bytes32",
                "name": "leaf",
                "type": "bytes32"
            }
        ],
        "name": "verifyState",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "group",
                "type": "uint256"
            },
            {
                "internalType": "bytes32[]",
                "name": "proof",
                "type": "bytes32[]"
            },
            {
                "internalType": "bool[]",
                "name": "proofFlags",
                "type": "bool[]"
            },
            {
                "internalType": "bytes32[]",
                "name": "leaves",
                "type": "bytes32[]"
            }
        ],
        "name": "verifyStates",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const PKP_NFT_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    }
] as const;

export const PKP_HELPER_ABI = [{ "inputs": [{ "internalType": "address", "name": "_resolver", "type": "address" }, { "internalType": "enum ContractResolver.Env", "name": "_env", "type": "uint8" }], "stateMutability": "nonpayable", "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "newResolverAddress", "type": "address" }], "name": "ContractResolverAddressSet", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "indexed": true, "internalType": "bytes32", "name": "previousAdminRole", "type": "bytes32" }, { "indexed": true, "internalType": "bytes32", "name": "newAdminRole", "type": "bytes32" }], "name": "RoleAdminChanged", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "indexed": true, "internalType": "address", "name": "account", "type": "address" }, { "indexed": true, "internalType": "address", "name": "sender", "type": "address" }], "name": "RoleGranted", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "indexed": true, "internalType": "address", "name": "account", "type": "address" }, { "indexed": true, "internalType": "address", "name": "sender", "type": "address" }], "name": "RoleRevoked", "type": "event" }, { "inputs": [], "name": "DEFAULT_ADMIN_ROLE", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "bytes32", "name": "derivedKeyId", "type": "bytes32" }, { "components": [{ "internalType": "bytes32", "name": "r", "type": "bytes32" }, { "internalType": "bytes32", "name": "s", "type": "bytes32" }, { "internalType": "uint8", "name": "v", "type": "uint8" }], "internalType": "struct IPubkeyRouter.Signature[]", "name": "signatures", "type": "tuple[]" }], "internalType": "struct LibPKPNFTStorage.ClaimMaterial", "name": "claimMaterial", "type": "tuple" }, { "components": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "bytes[]", "name": "permittedIpfsCIDs", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedIpfsCIDScopes", "type": "uint256[][]" }, { "internalType": "address[]", "name": "permittedAddresses", "type": "address[]" }, { "internalType": "uint256[][]", "name": "permittedAddressScopes", "type": "uint256[][]" }, { "internalType": "uint256[]", "name": "permittedAuthMethodTypes", "type": "uint256[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodIds", "type": "bytes[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodPubkeys", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedAuthMethodScopes", "type": "uint256[][]" }, { "internalType": "bool", "name": "addPkpEthAddressAsPermittedAddress", "type": "bool" }, { "internalType": "bool", "name": "sendPkpToItself", "type": "bool" }], "internalType": "struct PKPHelper.AuthMethodData", "name": "authMethodData", "type": "tuple" }], "name": "claimAndMintNextAndAddAuthMethods", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "bytes32", "name": "derivedKeyId", "type": "bytes32" }, { "components": [{ "internalType": "bytes32", "name": "r", "type": "bytes32" }, { "internalType": "bytes32", "name": "s", "type": "bytes32" }, { "internalType": "uint8", "name": "v", "type": "uint8" }], "internalType": "struct IPubkeyRouter.Signature[]", "name": "signatures", "type": "tuple[]" }], "internalType": "struct LibPKPNFTStorage.ClaimMaterial", "name": "claimMaterial", "type": "tuple" }, { "components": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "bytes[]", "name": "permittedIpfsCIDs", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedIpfsCIDScopes", "type": "uint256[][]" }, { "internalType": "address[]", "name": "permittedAddresses", "type": "address[]" }, { "internalType": "uint256[][]", "name": "permittedAddressScopes", "type": "uint256[][]" }, { "internalType": "uint256[]", "name": "permittedAuthMethodTypes", "type": "uint256[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodIds", "type": "bytes[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodPubkeys", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedAuthMethodScopes", "type": "uint256[][]" }, { "internalType": "bool", "name": "addPkpEthAddressAsPermittedAddress", "type": "bool" }, { "internalType": "bool", "name": "sendPkpToItself", "type": "bool" }], "internalType": "struct PKPHelper.AuthMethodData", "name": "authMethodData", "type": "tuple" }], "name": "claimAndMintNextAndAddAuthMethodsWithTypes", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [], "name": "contractResolver", "outputs": [{ "internalType": "contract ContractResolver", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "env", "outputs": [{ "internalType": "enum ContractResolver.Env", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getDomainWalletRegistry", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getPKPNftMetdataAddress", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getPkpNftAddress", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getPkpPermissionsAddress", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }], "name": "getRoleAdmin", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "internalType": "address", "name": "account", "type": "address" }], "name": "grantRole", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "internalType": "address", "name": "account", "type": "address" }], "name": "hasRole", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "uint256[]", "name": "permittedAuthMethodTypes", "type": "uint256[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodIds", "type": "bytes[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodPubkeys", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedAuthMethodScopes", "type": "uint256[][]" }, { "internalType": "bool", "name": "addPkpEthAddressAsPermittedAddress", "type": "bool" }, { "internalType": "bool", "name": "sendPkpToItself", "type": "bool" }], "name": "mintNextAndAddAuthMethods", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "bytes[]", "name": "permittedIpfsCIDs", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedIpfsCIDScopes", "type": "uint256[][]" }, { "internalType": "address[]", "name": "permittedAddresses", "type": "address[]" }, { "internalType": "uint256[][]", "name": "permittedAddressScopes", "type": "uint256[][]" }, { "internalType": "uint256[]", "name": "permittedAuthMethodTypes", "type": "uint256[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodIds", "type": "bytes[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodPubkeys", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedAuthMethodScopes", "type": "uint256[][]" }, { "internalType": "bool", "name": "addPkpEthAddressAsPermittedAddress", "type": "bool" }, { "internalType": "bool", "name": "sendPkpToItself", "type": "bool" }], "name": "mintNextAndAddAuthMethodsWithTypes", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "keyType", "type": "uint256" }, { "internalType": "uint256[]", "name": "permittedAuthMethodTypes", "type": "uint256[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodIds", "type": "bytes[]" }, { "internalType": "bytes[]", "name": "permittedAuthMethodPubkeys", "type": "bytes[]" }, { "internalType": "uint256[][]", "name": "permittedAuthMethodScopes", "type": "uint256[][]" }, { "internalType": "string[]", "name": "nftMetadata", "type": "string[]" }, { "internalType": "bool", "name": "addPkpEthAddressAsPermittedAddress", "type": "bool" }, { "internalType": "bool", "name": "sendPkpToItself", "type": "bool" }], "name": "mintNextAndAddDomainWalletMetadata", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }, { "internalType": "address", "name": "", "type": "address" }, { "internalType": "uint256", "name": "", "type": "uint256" }, { "internalType": "bytes", "name": "", "type": "bytes" }], "name": "onERC721Received", "outputs": [{ "internalType": "bytes4", "name": "", "type": "bytes4" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }], "name": "removePkpMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "internalType": "address", "name": "account", "type": "address" }], "name": "renounceRole", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "internalType": "address", "name": "account", "type": "address" }], "name": "revokeRole", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newResolverAddress", "type": "address" }], "name": "setContractResolver", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "internalType": "string[]", "name": "nftMetadata", "type": "string[]" }], "name": "setPkpMetadata", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }], "name": "supportsInterface", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }] as const;

export const RATE_LIMIT_NFT_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "expiresAt", "type": "uint256" }
        ],
        "name": "mint",
        "outputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "requestsPerKilosecond", "type": "uint256" },
            { "internalType": "uint256", "name": "expiresAt", "type": "uint256" }
        ],
        "name": "calculateCost",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "from", "type": "address" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "safeTransferFrom",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
            { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "uint256", "name": "index", "type": "uint256" }
        ],
        "name": "tokenOfOwnerByIndex",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
        "name": "capacity",
        "outputs": [
            {
                "components": [
                    { "internalType": "uint256", "name": "requestsPerKilosecond", "type": "uint256" },
                    { "internalType": "uint256", "name": "expiresAt", "type": "uint256" }
                ],
                "internalType": "struct LibRateLimitNFTStorage.RateLimit",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const; 