

0x1d31F259eE307358a26dFb23EB365939E8641195

// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.26;

import {ISafeSignerFactory} from "./interfaces/ISafeSignerFactory.sol";
import {SafeWebAuthnSignerProxy} from "./SafeWebAuthnSignerProxy.sol";
import {SafeWebAuthnSignerSingleton} from "./SafeWebAuthnSignerSingleton.sol";
import {P256} from "./libraries/P256.sol";

/**
 * @title Safe WebAuthn Signer Factory
 * @dev A factory contract for creating WebAuthn signers. Additionally, the factory supports
 * signature verification without deploying a signer proxies.
 * @custom:security-contact bounty@safe.global
 */
contract SafeWebAuthnSignerFactory is ISafeSignerFactory {
    /**
     * @notice The {SafeWebAuthnSignerSingleton} implementation to that is used for signature
     * verification by this contract and any proxies it deploys.
     */
    SafeWebAuthnSignerSingleton public immutable SINGLETON;

    /**
     * @notice Creates a new WebAuthn Safe signer factory contract.
     * @dev The {SafeWebAuthnSignerSingleton} singleton implementation is created with as part of
     * this constructor. This ensures that the singleton contract is known, and lets us make certain
     * assumptions about how it works.
     */
    constructor() {
        SINGLETON = new SafeWebAuthnSignerSingleton();
    }

    /**
     * @inheritdoc ISafeSignerFactory
     */
    function getSigner(uint256 x, uint256 y, P256.Verifiers verifiers) public view override returns (address signer) {
        bytes32 codeHash = keccak256(
            abi.encodePacked(
                type(SafeWebAuthnSignerProxy).creationCode,
                uint256(uint160(address(SINGLETON))),
                x,
                y,
                uint256(P256.Verifiers.unwrap(verifiers))
            )
        );
        signer = address(uint160(uint256(keccak256(abi.encodePacked(hex"ff", address(this), bytes32(0), codeHash)))));
    }

    /**
     * @inheritdoc ISafeSignerFactory
     */
    function createSigner(uint256 x, uint256 y, P256.Verifiers verifiers) external returns (address signer) {
        signer = getSigner(x, y, verifiers);

        if (_hasNoCode(signer)) {
            SafeWebAuthnSignerProxy created = new SafeWebAuthnSignerProxy{salt: bytes32(0)}(address(SINGLETON), x, y, verifiers);
            assert(address(created) == signer);
            emit Created(signer, x, y, verifiers);
        }
    }

    /**
     * @inheritdoc ISafeSignerFactory
     */
    function isValidSignatureForSigner(
        bytes32 message,
        bytes calldata signature,
        uint256 x,
        uint256 y,
        P256.Verifiers verifiers
    ) external view override returns (bytes4 magicValue) {
        address singleton = address(SINGLETON);
        bytes memory data = abi.encodePacked(
            abi.encodeWithSignature("isValidSignature(bytes32,bytes)", message, signature),
            x,
            y,
            verifiers
        );

        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            // staticcall to the singleton contract with return size given as 32 bytes. The
            // singleton contract is known and immutable so it is safe to specify return size.
            if staticcall(gas(), singleton, add(data, 0x20), mload(data), 0, 32) {
                magicValue := mload(0)
            }
        }
    }

    /**
     * @dev Checks if the provided account has no code.
     * @param account The address of the account to check.
     * @return result True if the account has no code, false otherwise.
     */
    function _hasNoCode(address account) internal view returns (bool result) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            result := iszero(extcodesize(account))
        }
    }
}

then

SafeWebAuthnSharedSigner
0x94a4F6affBd8975951142c3999aEAB7ecee555c2

// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.26;

import {SignatureValidator} from "../base/SignatureValidator.sol";
import {ISafe} from "../interfaces/ISafe.sol";
import {P256, WebAuthn} from "../libraries/WebAuthn.sol";

/**
 * @title Safe WebAuthn Shared Signer
 * @dev A contract for verifying WebAuthn signatures shared by all Safe accounts. This contract uses
 * storage from the Safe account itself for full ERC-4337 compatibility.
 */
contract SafeWebAuthnSharedSigner is SignatureValidator {
    /**
     * @notice Data associated with a WebAuthn signer. It represents the X and Y coordinates of the
     * signer's public key as well as the P256 verifiers to use. This is stored in account storage
     * starting at the storage slot {SIGNER_SLOT}.
     */
    struct Signer {
        uint256 x;
        uint256 y;
        P256.Verifiers verifiers;
    }

    /**
     * @notice The storage slot of the mapping from shared WebAuthn signer address to signer data.
     * @custom:computed-as keccak256("SafeWebAuthnSharedSigner.signer") - 1
     * @dev This value is intentionally computed to be a hash -1 as a precaution to avoid any
     * potential issues from unintended hash collisions, and have enough space for all the signer
     * fields. Also, this is the slot of a `mapping(address self => Signer)` to ensure that multiple
     * {SafeWebAuthnSharedSigner} instances can coexist with the same account.
     */
    uint256 private constant _SIGNER_MAPPING_SLOT = 0x2e0aed53485dc2290ceb5ce14725558ad3e3a09d38c69042410ad15c2b4ea4e8;

    /**
     * @notice Address of the shared signer contract itself.
     * @dev This is used for determining whether or not the contract is being `DELEGATECALL`-ed when
     * setting signer data.
     */
    address private immutable _SELF;

    /**
     * @notice The starting storage slot on the account containing the signer data.
     */
    uint256 public immutable SIGNER_SLOT;

    /**
     * @notice Emitted when the shared signer is configured for an account.
     * @dev Note that the configured account is not included in the event data. Since configuration
     * is done as a `DELEGATECALL`, the contract emitting the event is the configured account. This
     * is also why the event name is prefixed with `SafeWebAuthnSharedSigner`, in order to avoid
     * event `topic0` collisions with other contracts (seeing as "configured" is a common term).
     * @param publicKeyHash The Keccak-256 hash of the public key coordinates.
     * @param x The x-coordinate of the public key.
     * @param y The y-coordinate of the public key.
     * @param verifiers The P-256 verifiers to use.
     */
    event SafeWebAuthnSharedSignerConfigured(bytes32 indexed publicKeyHash, uint256 x, uint256 y, P256.Verifiers verifiers);

    /**
     * @notice An error indicating a `CALL` to a function that should only be `DELEGATECALL`-ed.
     */
    error NotDelegateCalled();

    /**
     * @notice Create a new shared WebAuthn signer instance.
     */
    constructor() {
        _SELF = address(this);
        SIGNER_SLOT = uint256(keccak256(abi.encode(address(this), _SIGNER_MAPPING_SLOT)));
    }

    /**
     * @notice Validates the call is done via `DELEGATECALL`.
     */
    modifier onlyDelegateCall() {
        if (address(this) == _SELF) {
            revert NotDelegateCalled();
        }
        _;
    }

    /**
     * @notice Return the signer configuration for the specified account.
     * @dev The calling account must be a Safe, as the signer data is stored in the Safe's storage
     * and must be read with the {StorageAccessible} support from the Safe.
     * @param account The account to request signer data for.
     */
    function getConfiguration(address account) public view returns (Signer memory signer) {
        bytes memory getStorageAtData = abi.encodeCall(ISafe(account).getStorageAt, (SIGNER_SLOT, 3));

        // Call the {StorageAccessible.getStorageAt} with assembly. This allows us to return a
        // zeroed out signer configuration instead of reverting for `account`s that are not Safes.
        // We also, expect the implementation to behave **exactly** like the Safe's - that is it
        // should encode the return data using a standard ABI encoding:
        // - The first 32 bytes is the offset of the values bytes array, always `0x20`
        // - The second 32 bytes is the length of the values bytes array, always `0x60`
        // - the following 3 words (96 bytes) are the values of the signer configuration.

        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            // Note that Yul expressions are evaluated in reverse order, so the `staticcall` is the
            // first thing to be evaluated in the nested `and` expression.
            if and(
                and(
                    // The offset of the ABI encoded bytes is 0x20, this should always be the case
                    // for standard ABI encoding of `(bytes)` tuple that `getStorageAt` returns.
                    eq(mload(0x00), 0x20),
                    // The length of the encoded bytes is exactly 0x60 bytes (i.e. 3 words, which is
                    // exactly how much we read from the Safe's storage in the `getStorageAt` call).
                    eq(mload(0x20), 0x60)
                ),
                and(
                    // The length of the return data should be exactly 0xa0 bytes, which should
                    // always be the case for the Safe's `getStorageAt` implementation.
                    eq(returndatasize(), 0xa0),
                    // The call succeeded. We write the first two words of the return data into the
                    // scratch space, as we need to inspect them before copying the signer
                    // signer configuration to our `signer` memory pointer.
                    staticcall(gas(), account, add(getStorageAtData, 0x20), mload(getStorageAtData), 0x00, 0x40)
                )
            ) {
                // Copy only the storage values from the return data to our `signer` memory address.
                // This only happens on success, so the `signer` value will be zeroed out if any of
                // the above conditions fail, indicating that no signer is configured.
                returndatacopy(signer, 0x40, 0x60)
            }
        }
    }

    /**
     * @notice Sets the signer configuration for the calling account.
     * @dev The Safe must call this function with a `DELEGATECALL`, as the signer data is stored in
     * the Safe account's storage.
     * @param signer The new signer data to set for the calling account.
     */
    function configure(Signer memory signer) external onlyDelegateCall {
        uint256 signerSlot = SIGNER_SLOT;
        Signer storage signerStorage;

        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            signerStorage.slot := signerSlot
        }

        signerStorage.x = signer.x;
        signerStorage.y = signer.y;
        signerStorage.verifiers = signer.verifiers;

        bytes32 publicKeyHash = keccak256(abi.encode(signer.x, signer.y));
        emit SafeWebAuthnSharedSignerConfigured(publicKeyHash, signer.x, signer.y, signer.verifiers);
    }

    /**
     * @inheritdoc SignatureValidator
     */
    function _verifySignature(bytes32 message, bytes calldata signature) internal view virtual override returns (bool isValid) {
        Signer memory signer = getConfiguration(msg.sender);

        // Make sure that the signer is configured in the first place.
        if (P256.Verifiers.unwrap(signer.verifiers) == 0) {
            return false;
        }

        isValid = WebAuthn.verifySignature(message, signature, WebAuthn.USER_VERIFICATION, signer.x, signer.y, signer.verifiers);
    }
}

DAIMOVERIFEIY
0xc2b78104907F722DABAc4C69f826a522B2754De4

/ SPDX-License-Identifier: MIT
// Force a specific Solidity version for reproducibility.
pragma solidity 0.8.21;

/**
 * This contract verifies P256 (secp256r1) signatures. It matches the exact
 * interface specified in the EIP-7212 precompile, allowing it to be used as a
 * fallback. It's based on Ledger's optimized implementation:
 * https://github.com/rdubois-crypto/FreshCryptoLib/tree/master/solidity
 **/
contract P256Verifier {
    /**
     * Precompiles don't use a function signature. The first byte of callldata
     * is the first byte of an input argument. In this case:
     *
     * input[  0: 32] = signed data hash
     * input[ 32: 64] = signature r
     * input[ 64: 96] = signature s
     * input[ 96:128] = public key x
     * input[128:160] = public key y
     *
     * result[ 0: 32] = 0x00..00 (invalid) or 0x00..01 (valid)
     *
     * For details, see https://eips.ethereum.org/EIPS/eip-7212
     */
    fallback(bytes calldata input) external returns (bytes memory) {
        if (input.length != 160) {
            return abi.encodePacked(uint256(0));
        }

        bytes32 hash = bytes32(input[0:32]);
        uint256 r = uint256(bytes32(input[32:64]));
        uint256 s = uint256(bytes32(input[64:96]));
        uint256 x = uint256(bytes32(input[96:128]));
        uint256 y = uint256(bytes32(input[128:160]));

        uint256 ret = ecdsa_verify(hash, r, s, [x, y]) ? 1 : 0;

        return abi.encodePacked(ret);
    }

    // Parameters for the sec256r1 (P256) elliptic curve
    // Curve prime field modulus
    uint256 constant p =
        0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
    // Short weierstrass first coefficient
    uint256 constant a = // The assumption a == -3 (mod p) is used throughout the codebase
        0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC;
    // Short weierstrass second coefficient
    uint256 constant b =
        0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;
    // Generating point affine coordinates
    uint256 constant GX =
        0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296;
    uint256 constant GY =
        0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5;
    // Curve order (number of points)
    uint256 constant n =
        0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    // -2 mod p constant, used to speed up inversion and doubling (avoid negation)
    uint256 constant minus_2modp =
        0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFD;
    // -2 mod n constant, used to speed up inversion
    uint256 constant minus_2modn =
        0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC63254F;

    /**
     * @dev ECDSA verification given signature and public key.
     */
    function ecdsa_verify(
        bytes32 message_hash,
        uint256 r,
        uint256 s,
        uint256[2] memory pubKey
    ) private view returns (bool) {
        // Check r and s are in the scalar field
        if (r == 0 || r >= n || s == 0 || s >= n) {
            return false;
        }

        if (!ecAff_isValidPubkey(pubKey[0], pubKey[1])) {
            return false;
        }

        uint256 sInv = nModInv(s);

        uint256 scalar_u = mulmod(uint256(message_hash), sInv, n); // (h * s^-1) in scalar field
        uint256 scalar_v = mulmod(r, sInv, n); // (r * s^-1) in scalar field

        uint256 r_x = ecZZ_mulmuladd(
            pubKey[0],
            pubKey[1],
            scalar_u,
            scalar_v
        );
        return r_x % n == r;
    }

    /**
     * @dev Check if a point in affine coordinates is on the curve
     * Reject 0 point at infinity.
     */
    function ecAff_isValidPubkey(
        uint256 x,
        uint256 y
    ) internal pure returns (bool) {
        if (x >= p || y >= p || (x == 0 && y == 0)) {
            return false;
        }

        return ecAff_satisfiesCurveEqn(x, y);
    }

    function ecAff_satisfiesCurveEqn(
        uint256 x,
        uint256 y
    ) internal pure returns (bool) {
        uint256 LHS = mulmod(y, y, p); // y^2
        uint256 RHS = addmod(mulmod(mulmod(x, x, p), x, p), mulmod(a, x, p), p); // x^3 + a x
        RHS = addmod(RHS, b, p); // x^3 + a*x + b

        return LHS == RHS;
    }

    /**
     * @dev Computation of uG + vQ using Strauss-Shamir's trick, G basepoint, Q public key
     * returns tuple of (x coordinate of uG + vQ, boolean that is false if internal precompile staticcall fail)
     * Strauss-Shamir is described well in https://stackoverflow.com/a/50994362
     */
    function ecZZ_mulmuladd(
        uint256 QX,
        uint256 QY, // affine rep for input point Q
        uint256 scalar_u,
        uint256 scalar_v
    ) internal view returns (uint256 X) {
        uint256 zz = 1;
        uint256 zzz = 1;
        uint256 Y;
        uint256 HX;
        uint256 HY;

        if (scalar_u == 0 && scalar_v == 0) return 0;

        // H = g + Q
        (HX, HY) = ecAff_add(GX, GY, QX, QY);

        int256 index = 255;
        uint256 bitpair;

        // Find the first bit index that's active in either scalar_u or scalar_v.
        while(index >= 0) {
            bitpair = compute_bitpair(uint256(index), scalar_u, scalar_v);
            index--;
            if (bitpair != 0) break;
        }

        // initialise (X, Y) depending on the first active bitpair.
        // invariant(bitpair != 0); // bitpair == 0 is only possible if u and v are 0.
        
        if (bitpair == 1) {
            (X, Y) = (GX, GY);
        } else if (bitpair == 2) {
            (X, Y) = (QX, QY);
        } else if (bitpair == 3) {
            (X, Y) = (HX, HY);
        }

        uint256 TX;
        uint256 TY;
        while(index >= 0) {
            (X, Y, zz, zzz) = ecZZ_double_zz(X, Y, zz, zzz);

            bitpair = compute_bitpair(uint256(index), scalar_u, scalar_v);
            index--;

            if (bitpair == 0) {
                continue;
            } else if (bitpair == 1) {
                (TX, TY) = (GX, GY);
            } else if (bitpair == 2) {
                (TX, TY) = (QX, QY);
            } else {
                (TX, TY) = (HX, HY);
            }

            (X, Y, zz, zzz) = ecZZ_dadd_affine(X, Y, zz, zzz, TX, TY);
        }

        uint256 zzInv = pModInv(zz); // If zz = 0, zzInv = 0.
        X = mulmod(X, zzInv, p); // X/zz
    }

    /**
     * @dev Compute the bits at `index` of u and v and return
     * them as 2 bit concatenation. The bit at index 0 is on 
     * if the `index`th bit of scalar_u is on and the bit at
     * index 1 is on if the `index`th bit of scalar_v is on.
     * Examples:
     * - compute_bitpair(0, 1, 1) == 3
     * - compute_bitpair(0, 1, 0) == 1
     * - compute_bitpair(0, 0, 1) == 2
     */
    function compute_bitpair(uint256 index, uint256 scalar_u, uint256 scalar_v) internal pure returns (uint256 ret) {
        ret = (((scalar_v >> index) & 1) << 1) + ((scalar_u >> index) & 1);
    }

    /**
     * @dev Add two elliptic curve points in affine coordinates
     * Assumes points are on the EC
     */
    function ecAff_add(
        uint256 x1,
        uint256 y1,
        uint256 x2,
        uint256 y2
    ) internal view returns (uint256, uint256) {
        // invariant(ecAff_IsZero(x1, y1) || ecAff_isOnCurve(x1, y1));
        // invariant(ecAff_IsZero(x2, y2) || ecAff_isOnCurve(x2, y2));

        uint256 zz1;
        uint256 zzz1;

        if (ecAff_IsInf(x1, y1)) return (x2, y2);
        if (ecAff_IsInf(x2, y2)) return (x1, y1);

        (x1, y1, zz1, zzz1) = ecZZ_dadd_affine(x1, y1, 1, 1, x2, y2);

        return ecZZ_SetAff(x1, y1, zz1, zzz1);
    }

    /**
     * @dev Check if a point is the infinity point in affine rep.
     * Assumes point is on the EC or is the point at infinity.
     */
    function ecAff_IsInf(
        uint256 x,
        uint256 y
    ) internal pure returns (bool flag) {
        // invariant((x == 0 && y == 0) || ecAff_isOnCurve(x, y));

        return (x == 0 && y == 0);
    }

    /**
     * @dev Check if a point is the infinity point in ZZ rep.
     * Assumes point is on the EC or is the point at infinity.
     */
    function ecZZ_IsInf(
        uint256 zz,
        uint256 zzz
    ) internal pure returns (bool flag) {
        // invariant((zz == 0 && zzz == 0) || ecAff_isOnCurve(x, y) for affine 
        // form of the point)

        return (zz == 0 && zzz == 0);
    }

    /**
     * @dev Add a ZZ point to an affine point and return as ZZ rep
     * Uses madd-2008-s and mdbl-2008-s internally
     * https://hyperelliptic.org/EFD/g1p/auto-shortw-xyzz-3.html#addition-madd-2008-s
     * Matches https://github.com/supranational/blst/blob/9c87d4a09d6648e933c818118a4418349804ce7f/src/ec_ops.h#L705 closely
     * Handles points at infinity gracefully
     */
    function ecZZ_dadd_affine(
        uint256 x1,
        uint256 y1,
        uint256 zz1,
        uint256 zzz1,
        uint256 x2,
        uint256 y2
    ) internal pure returns (uint256 x3, uint256 y3, uint256 zz3, uint256 zzz3) {
        if (ecAff_IsInf(x2, y2)) { // (X2, Y2) is point at infinity
            if (ecZZ_IsInf(zz1, zzz1)) return ecZZ_PointAtInf();
            return (x1, y1, zz1, zzz1);
        } else if (ecZZ_IsInf(zz1, zzz1)) { // (X1, Y1) is point at infinity
            return (x2, y2, 1, 1);
        }

        uint256 comp_R = addmod(mulmod(y2, zzz1, p), p - y1, p); // R = S2 - y1 = y2*zzz1 - y1
        uint256 comp_P = addmod(mulmod(x2, zz1, p), p - x1, p); // P = U2 - x1 = x2*zz1 - x1

        if (comp_P != 0) { // X1 != X2
            // invariant(x1 != x2);
            uint256 comp_PP = mulmod(comp_P, comp_P, p); // PP = P^2
            uint256 comp_PPP = mulmod(comp_PP, comp_P, p); // PPP = P*PP
            zz3 = mulmod(zz1, comp_PP, p); //// ZZ3 = ZZ1*PP
            zzz3 = mulmod(zzz1, comp_PPP, p); //// ZZZ3 = ZZZ1*PPP
            uint256 comp_Q = mulmod(x1, comp_PP, p); // Q = X1*PP
            x3 = addmod(
                addmod(mulmod(comp_R, comp_R, p), p - comp_PPP, p), // (R^2) + (-PPP)
                mulmod(minus_2modp, comp_Q, p), // (-2)*(Q)
                p
            ); // R^2 - PPP - 2*Q
            y3 = addmod(
                mulmod(addmod(comp_Q, p - x3, p), comp_R, p), //(Q+(-x3))*R
                mulmod(p - y1, comp_PPP, p), // (-y1)*PPP
                p
            ); // R*(Q-x3) - y1*PPP
        } else if (comp_R == 0) { // X1 == X2 and Y1 == Y2
            // invariant(x1 == x2 && y1 == y2);

            // Must be affine because (X2, Y2) is affine.
            (x3, y3, zz3, zzz3) = ecZZ_double_affine(x2, y2);
        } else { // X1 == X2 and Y1 == -Y2
            // invariant(x1 == x2 && y1 == p - y2);
            (x3, y3, zz3, zzz3) = ecZZ_PointAtInf();
        }

        return (x3, y3, zz3, zzz3);
    }

    /**
     * @dev Double a ZZ point 
     * Uses http://hyperelliptic.org/EFD/g1p/auto-shortw-xyzz.html#doubling-dbl-2008-s-1
     * Handles point at infinity gracefully
     */
    function ecZZ_double_zz(uint256 x1,
        uint256 y1, uint256 zz1, uint256 zzz1) internal pure returns (uint256 x3, uint256 y3, uint256 zz3, uint256 zzz3) {
        if (ecZZ_IsInf(zz1, zzz1)) return ecZZ_PointAtInf();
    
        uint256 comp_U = mulmod(2, y1, p); // U = 2*Y1
        uint256 comp_V = mulmod(comp_U, comp_U, p); // V = U^2
        uint256 comp_W = mulmod(comp_U, comp_V, p); // W = U*V
        uint256 comp_S = mulmod(x1, comp_V, p); // S = X1*V
        uint256 comp_M = addmod(mulmod(3, mulmod(x1, x1, p), p), mulmod(a, mulmod(zz1, zz1, p), p), p); //M = 3*(X1)^2 + a*(zz1)^2
        
        x3 = addmod(mulmod(comp_M, comp_M, p), mulmod(minus_2modp, comp_S, p), p); // M^2 + (-2)*S
        y3 = addmod(mulmod(comp_M, addmod(comp_S, p - x3, p), p), mulmod(p - comp_W, y1, p), p); // M*(S+(-X3)) + (-W)*Y1
        zz3 = mulmod(comp_V, zz1, p); // V*ZZ1
        zzz3 = mulmod(comp_W, zzz1, p); // W*ZZZ1
    }

    /**
     * @dev Double an affine point and return as a ZZ point 
     * Uses http://hyperelliptic.org/EFD/g1p/auto-shortw-xyzz.html#doubling-mdbl-2008-s-1
     * Handles point at infinity gracefully
     */
    function ecZZ_double_affine(uint256 x1,
        uint256 y1) internal pure returns (uint256 x3, uint256 y3, uint256 zz3, uint256 zzz3) {
        if (ecAff_IsInf(x1, y1)) return ecZZ_PointAtInf();

        uint256 comp_U = mulmod(2, y1, p); // U = 2*Y1
        zz3 = mulmod(comp_U, comp_U, p); // V = U^2 = zz3
        zzz3 = mulmod(comp_U, zz3, p); // W = U*V = zzz3
        uint256 comp_S = mulmod(x1, zz3, p); // S = X1*V
        uint256 comp_M = addmod(mulmod(3, mulmod(x1, x1, p), p), a, p); // M = 3*(X1)^2 + a
        
        x3 = addmod(mulmod(comp_M, comp_M, p), mulmod(minus_2modp, comp_S, p), p); // M^2 + (-2)*S
        y3 = addmod(mulmod(comp_M, addmod(comp_S, p - x3, p), p), mulmod(p - zzz3, y1, p), p); // M*(S+(-X3)) + (-W)*Y1
    }

    /**
     * @dev Convert from ZZ rep to affine rep
     * Assumes (zz)^(3/2) == zzz (i.e. zz == z^2 and zzz == z^3)
     * See https://hyperelliptic.org/EFD/g1p/auto-shortw-xyzz-3.html
     */
    function ecZZ_SetAff(
        uint256 x,
        uint256 y,
        uint256 zz,
        uint256 zzz
    ) internal view returns (uint256 x1, uint256 y1) {
        if(ecZZ_IsInf(zz, zzz)) {
            (x1, y1) = ecAffine_PointAtInf();
            return (x1, y1);
        }

        uint256 zzzInv = pModInv(zzz); // 1 / zzz
        uint256 zInv = mulmod(zz, zzzInv, p); // 1 / z
        uint256 zzInv = mulmod(zInv, zInv, p); // 1 / zz

        // invariant(mulmod(FCL_pModInv(zInv), FCL_pModInv(zInv), p) == zz)
        // invariant(mulmod(mulmod(FCL_pModInv(zInv), FCL_pModInv(zInv), p), FCL_pModInv(zInv), p) == zzz)

        x1 = mulmod(x, zzInv, p); // X / zz
        y1 = mulmod(y, zzzInv, p); // y = Y / zzz
    }

    /**
     * @dev Point at infinity in ZZ rep
     */
    function ecZZ_PointAtInf() internal pure returns (uint256, uint256, uint256, uint256) {
        return (0, 0, 0, 0);
    }

    /**
     * @dev Point at infinity in affine rep
     */
    function ecAffine_PointAtInf() internal pure returns (uint256, uint256) {
        return (0, 0);
    }

    /**
     * @dev u^-1 mod n
     */
    function nModInv(uint256 u) internal view returns (uint256) {
        return modInv(u, n, minus_2modn);
    }

    /**
     * @dev u^-1 mod p
     */
    function pModInv(uint256 u) internal view returns (uint256) {
        return modInv(u, p, minus_2modp);
    }

    /**
     * @dev u^-1 mod f = u^(phi(f) - 1) mod f = u^(f-2) mod f for prime f
     * by Fermat's little theorem, compute u^(f-2) mod f using modexp precompile
     * Assume f != 0. If u is 0, then u^-1 mod f is undefined mathematically, 
     * but this function returns 0.
     */
    function modInv(uint256 u, uint256 f, uint256 minus_2modf) internal view returns (uint256 result) {
        // invariant(f != 0);
        // invariant(f prime);

        // This seems like a relatively standard way to use this precompile:
        // https://github.com/OpenZeppelin/openzeppelin-contracts/pull/3298/files#diff-489d4519a087ca2c75be3315b673587abeca3b302f807643e97efa7de8cb35a5R427

        (bool success, bytes memory ret) = (address(0x05).staticcall(abi.encode(32, 32, 32, u, minus_2modf, f)));
        assert(success); // precompile should never fail on regular EVM environments
        result = abi.decode(ret, (uint256));
    }
}



FCLX
0xA86e0054C51E4894D88762a017ECc5E5235f5DBA
// SPDX-License-Identifier: LGPL-3.0-only
/* solhint-disable no-complex-fallback */
/* solhint-disable payable-fallback */
pragma solidity 0.8.26;

import {IP256Verifier} from "../interfaces/IP256Verifier.sol";
import {FCL_ecdsa} from "../vendor/FCL/FCL_ecdsa.sol";

/**
 * @title P-256 Elliptic Curve Verifier Based on The FreshCryptoLib P-256 Implementation.
 * @custom:security-contact bounty@safe.global
 */
contract FCLP256Verifier is IP256Verifier {
    /**
     * @inheritdoc IP256Verifier
     */
    fallback(bytes calldata input) external returns (bytes memory output) {
        if (input.length != 160) {
            return "";
        }

        bytes32 message;
        uint256 r;
        uint256 s;
        uint256 x;
        uint256 y;

        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            message := calldataload(0)
            r := calldataload(32)
            s := calldataload(64)
            x := calldataload(96)
            y := calldataload(128)
        }

        if (!FCL_ecdsa.ecdsa_verify(message, r, s, x, y)) {
            return "";
        }

        output = abi.encode(1);
    }
}

