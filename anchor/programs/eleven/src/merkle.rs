use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use txline_settlement::ProofNode;

/// Leaf hash for a LIVE pick: binds the pick to its owner + market + FROZEN points
/// + salt, so the committed Merkle root fixes both the pick and the odds it locked.
///   leaf = sha256(owner ++ market_index_le ++ side ++ award_points_le ++ salt)
pub fn live_pick_leaf(
    owner: &Pubkey,
    market_index: u16,
    side: u8,
    award_points: u32,
    salt: &[u8; 32],
) -> [u8; 32] {
    hashv(&[
        owner.as_ref(),
        &market_index.to_le_bytes()[..],
        &[side][..],
        &award_points.to_le_bytes()[..],
        &salt[..],
    ])
    .to_bytes()
}

/// Hash two 32-byte children into their parent (left ++ right). Used to build a
/// wave's Merkle root from its pick leaves.
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(&[&left[..], &right[..]]).to_bytes()
}

/// Fold a leaf up its authentication path and check it reaches `root`. Each node
/// says which side it sits on (`is_right_sibling`), so the parent is
/// `sha256(acc ++ node)` when the node is on the right, else `sha256(node ++ acc)`.
pub fn verifies(leaf: [u8; 32], proof: &[ProofNode], root: &[u8; 32]) -> bool {
    let mut acc = leaf;
    for node in proof {
        acc = if node.is_right_sibling {
            hashv(&[&acc[..], &node.hash[..]]).to_bytes()
        } else {
            hashv(&[&node.hash[..], &acc[..]]).to_bytes()
        };
    }
    &acc == root
}
