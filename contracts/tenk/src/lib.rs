use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LazyOption, UnorderedSet};
use near_sdk::{
    env, ext_contract, near_bindgen, AccountId, Balance, BorshStorageKey, PanicOnDefault,
    Promise, PublicKey, PromiseOrValue, serde_json::json
};
use std::collections::HashMap;


mod raffle;
use raffle::Raffle;

const MIN_STORAGE_DEPOSIT: Balance = 7_020_000_000_000_000_000_000;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    // Vector of available NFTs
    raffle: Raffle,
    total_supply: u64,
    pending_tokens: u32,
    unit_price: String,
}


#[ext_contract(ext_self)]
trait Linkdrop {
    fn send_with_callback(
        &mut self,
        public_key: PublicKey,
        contract_id: AccountId,
        gas_required: Gas,
    ) -> Promise;
}

const DATA_IMAGE_SVG_NEAR_ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 288 288'%3E%3Cg id='l' data-name='l'%3E%3Cpath d='M187.58,79.81l-30.1,44.69a3.2,3.2,0,0,0,4.75,4.2L191.86,103a1.2,1.2,0,0,1,2,.91v80.46a1.2,1.2,0,0,1-2.12.77L102.18,77.93A15.35,15.35,0,0,0,90.47,72.5H87.34A15.34,15.34,0,0,0,72,87.84V201.16A15.34,15.34,0,0,0,87.34,216.5h0a15.35,15.35,0,0,0,13.08-7.31l30.1-44.69a3.2,3.2,0,0,0-4.75-4.2L96.14,186a1.2,1.2,0,0,1-2-.91V104.61a1.2,1.2,0,0,1,2.12-.77l89.55,107.23a15.35,15.35,0,0,0,11.71,5.43h3.13A15.34,15.34,0,0,0,216,201.16V87.84A15.34,15.34,0,0,0,200.66,72.5h0A15.35,15.35,0,0,0,187.58,79.81Z'/%3E%3C/g%3E%3C/svg%3E";

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Ids,
    TokensPerOwner { account_hash: Vec<u8> },
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new_default_meta(
        owner_id: AccountId,
        name: String,
        symbol: String,
        uri: String,
        unit_price: String,
    ) -> Self {
        Self::new(
            owner_id,
            NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_string(),
                name,
                symbol,
                icon: Some(DATA_IMAGE_SVG_NEAR_ICON.to_string()),
                base_uri: Some(uri),
                reference: None,
                reference_hash: None,
            },
            unit_price,
            5
        )
    }

    #[init]
    pub fn new(
        owner_id: AccountId, 
        metadata: NFTContractMetadata, 
        unit_price: String,
        size: u64
    ) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        assert!(
            to_yocto(&unit_price) >= MIN_STORAGE_DEPOSIT,
            "Unit price is set too low"
        );
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            raffle: Raffle::new(StorageKey::Ids, size),
            total_supply: size,
            pending_tokens: 0,
            unit_price: unit_price,
        }
    }

    // -- view methods

    pub fn unit_price(&self) -> String {
        return self.unit_price.clone();
    }

    pub fn total_supply(&self) -> u64 {
        return self.total_supply;
    }

    pub fn remaining_count(&self) -> u64 {
       return self.total_supply - self.raffle.len();
    }
}

// -- mint related methods

#[near_bindgen]
impl Contract {
    #[payable]
    pub fn nft_mint(
        &mut self
    ) -> Token {
       self.nft_mint_one()
    }

    #[payable]
    pub fn nft_mint_one(&mut self) -> Token {
        self.assert_can_mint(1);
        self.internal_mint(env::signer_account_id())
    }

    // -- Private methods

    fn total_cost(&self, num: u32) -> Balance {
        to_yocto(&self.unit_price) * num as Balance
    }

    fn assert_deposit(&self, num: u32) {
        assert!(
            env::attached_deposit() == self.total_cost(num),
            "Must attach exact {} NEAR",
            self.unit_price()
        );
    }

    fn assert_can_mint(&self, num: u32) {
        // Check quantity
        assert!(self.raffle.len() as u32 >= self.pending_tokens + num , "No NFTs left to mint");
        // Owner can mint for free
        if env::signer_account_id() == self.tokens.owner_id {
          return;
        }
        self.assert_deposit(num);
    }

    // Currently have to copy the internals of mint because it requires that only the owner can mint
    fn internal_mint(&mut self, token_owner_id: AccountId) -> Token {
        let id = self.raffle.draw();
        let token_metadata = Some(self.create_metadata(id));
        let token_id = id.to_string();
        // TODO: figure out how to use internals
        // self.tokens.mint(token_id, token_owner_id, token_metadata);

        // assert_eq!(env::predecessor_account_id(), self.owner_id, "Unauthorized");
        // if self.tokens.token_metadata_by_id.is_some() && token_metadata.is_none() {
        //     env::panic(b"Must provide metadata");
        // }
        // if self.tokens.owner_by_id.get(&token_id).is_some() {
        //     env::panic(b"token_id must be unique");
        // }

        let owner_id: AccountId = token_owner_id;

        // Core behavior: every token must have an owner
        self.tokens.owner_by_id.insert(&token_id, &owner_id);

        // Metadata extension: Save metadata, keep variable around to return later.
        // Note that check above already panicked if metadata extension in use but no metadata
        // provided to call.
        self.tokens.token_metadata_by_id
            .as_mut()
            .and_then(|by_id| by_id.insert(&token_id, &token_metadata.as_ref().unwrap()));

        // Enumeration extension: Record tokens_per_owner for use with enumeration view methods.
        if let Some(tokens_per_owner) = &mut self.tokens.tokens_per_owner {
            let mut token_ids = tokens_per_owner.get(&owner_id).unwrap_or_else(|| {
                UnorderedSet::new(StorageKey::TokensPerOwner {
                    account_hash: env::sha256(owner_id.as_bytes()),
                })
            });
            token_ids.insert(&token_id);
            tokens_per_owner.insert(&owner_id, &token_ids);
        }

        // Approval Management extension: return empty HashMap as part of Token
        let approved_account_ids =
            if self.tokens.approvals_by_id.is_some() { Some(HashMap::new()) } else { None };

        // no need to refund deposit since its covered by the payment

        // TODO log!

        Token { token_id, owner_id, metadata: token_metadata, approved_account_ids }
    }

    fn create_metadata(&mut self, token_id: u64) -> TokenMetadata {
        let media = Some(format!("{}/{}/media", self.base_url(), token_id));
        let reference = Some(format!("{}/{}/info.json", self.base_url(), token_id));
        TokenMetadata {
            title: None,          // ex. "Arch Nemesis: Mail Carrier" or "Parcel #5055"
            description: None,    // free-form description
            media, // URL to associated media, preferably to decentralized, content-addressed storage
            media_hash: None, // Base64-encoded sha256 hash of content referenced by the `media` field. Required if `media` is included.
            copies: None, // number of copies of this set of metadata in existence when token was minted.
            issued_at: None, // ISO 8601 datetime when token was issued or minted
            expires_at: None, // ISO 8601 datetime when token expires
            starts_at: None, // ISO 8601 datetime when token starts being valid
            updated_at: None, // ISO 8601 datetime when token was last updated
            extra: None, // anything extra the NFT wants to store on-chain. Can be stringified JSON.
            reference,   // URL to an off-chain JSON file with more info.
            reference_hash: None, // Base64-encoded sha256 hash of JSON from reference field. Required if `reference` is included.
        }
    }

    fn base_url(&self) -> String {
        format!(
            "https://ipfs.io/ipfs/{}",
            self.metadata.get().unwrap().base_uri.unwrap()
        )
    }
}

// -- NEP171 core
// need to override default impl to have customized logging
#[near_bindgen]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens.nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        let owner_id = self.tokens.owner_by_id.get(&token_id).unwrap();
        env::log_str(
            &json!({
                "type": "nft_transfer",
                "params": {
                    "token_id": token_id,
                    "sender_id": owner_id,
                    "receiver_id": receiver_id,
                }
            })
            .to_string()
        );
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.tokens.nft_transfer_call(receiver_id.clone(), token_id.clone(), approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

impl NonFungibleTokenResolver for Contract {
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let transferred = self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        );

        if transferred {
            // transfer was reverted, need to log
            env::log_str(
                &json!({
                    "type": "nft_transfer",
                    "params": {
                        "token_id": token_id,
                        "sender_id": previous_owner_id,
                        "receiver_id": receiver_id,
                    }
                })
                .to_string()
            );
        };

        return transferred;
    }
}

near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

fn to_yocto(value: &str) -> u128 {
    let vals: Vec<_> = value.split('.').collect();
    let part1 = vals[0].parse::<u128>().unwrap() * 10u128.pow(24);
    if vals.len() > 1 {
        let power = vals[1].len() as u32;
        let part2 = vals[1].parse::<u128>().unwrap() * 10u128.pow(24 - power);
        part1 + part2
    } else {
        part1
    }
}
