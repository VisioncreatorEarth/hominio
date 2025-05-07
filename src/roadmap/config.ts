export const roadmapConfig = {
    "phases": [
        {
            "name": "Sahelanthropus",
            "description": "Phase 1: Corresponds to the Sahelanthropus era.",
            "chainId": 100,
            "protocolTokenAddress": "0x181CA58494Fc2C75FF805DEAA32ecD78377e135e",
            "shortTokenName": "SAHEL",
            "longTokenName": "Sahelanthropus",
            "rpcUrls": {
                "default": { "http": ["https://rpc.gnosischain.com/"] }
            },
            "blockExplorers": {
                "default": { "name": "Gnosis Blockscout", "url": "https://gnosis.blockscout.com/" }
            },
            "contracts": {
                "100": {
                    "GuardianEOA": "0x75e4Bf850Eec4c15801D16b90D259b5594b449c2",
                    "SafeWebAuthnSignerFactory": "0x1d31F259eE307358a26dFb23EB365939E8641195",
                    "FCLP256Verifier": "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA",
                    "EIP1271MagicValue": "0x1626ba7e"
                },
                "175188": {
                    "PKPPermissions": "0x60C1ddC8b9e38F730F0e7B70A2F84C1A98A69167",
                    "PKPNFTToken": "0x6a0f439f064B7167A8Ea6B22AcC07ae5360ee0d1",
                    "PKPHelper": "0x341E5273E2E2ea3c4aDa4101F008b1261E58510D",
                    "RateLimitNFT": "0xa17f11B7f828EEc97926E56D98D5AB63A0231b77"
                }
            },
            "tokenSupply": 7000000
        },
        {
            "name": "Orrorin",
            "description": "Phase 2: Corresponds to the Orrorin era.",
            "tokenSupply": 6000000
        },
        {
            "name": "Ardipithecus",
            "description": "Phase 3: Corresponds to the Ardipithecus era.",
            "tokenSupply": 5800000
        },
        {
            "name": "Australopithecus",
            "description": "Phase 4: Corresponds to the Australopithecus era.",
            "tokenSupply": 4200000
        },
        {
            "name": "Kenyanthropus",
            "description": "Phase 5: Corresponds to the Kenyanthropus era.",
            "tokenSupply": 3500000
        },
        {
            "name": "Paranthropus",
            "description": "Phase 6: Corresponds to the Paranthropus era.",
            "tokenSupply": 2700000
        },
        {
            "name": "Homo",
            "description": "Phase 7: Corresponds to the Homo era, leading to modern human features.",
            "tokenSupply": 2500000
        }
    ]
};