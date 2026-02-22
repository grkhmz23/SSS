#![forbid(unsafe_code)]

#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
struct QuotaState {
    window_start_ts: i64,
    window_seconds: i64,
    minted_in_window: u64,
    quota_amount: u64,
}

#[allow(dead_code)]
impl QuotaState {
    fn try_mint(&mut self, now: i64, amount: u64) -> bool {
        if now.saturating_sub(self.window_start_ts) >= self.window_seconds {
            self.window_start_ts = now;
            self.minted_in_window = 0;
        }

        match self.minted_in_window.checked_add(amount) {
            Some(next) if next <= self.quota_amount => {
                self.minted_in_window = next;
                true
            }
            _ => false,
        }
    }
}

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Role {
    Master,
    Pauser,
    Burner,
    Blacklister,
    Seizer,
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
struct RoleState {
    master: u64,
    pauser: u64,
    burner: u64,
    blacklister: u64,
    seizer: u64,
}

#[allow(dead_code)]
impl RoleState {
    fn transfer_master(&mut self, signer: u64, new_master: u64) -> bool {
        if signer != self.master {
            return false;
        }
        self.master = new_master;
        true
    }

    fn set_role(&mut self, signer: u64, role: Role, new_value: u64) -> bool {
        if signer != self.master {
            return false;
        }

        match role {
            Role::Master => self.master = new_value,
            Role::Pauser => self.pauser = new_value,
            Role::Burner => self.burner = new_value,
            Role::Blacklister => self.blacklister = new_value,
            Role::Seizer => self.seizer = new_value,
        }
        true
    }
}

#[cfg(test)]
mod fuzz {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn quota_arithmetic_is_bounded(
            quota in 1u64..10_000u64,
            window in 1i64..10_000i64,
            start in -100_000i64..100_000i64,
            now in -100_000i64..100_000i64,
            amount in 0u64..20_000u64,
        ) {
            let mut state = QuotaState {
                window_start_ts: start,
                window_seconds: window,
                minted_in_window: quota / 2,
                quota_amount: quota,
            };

            let accepted = state.try_mint(now, amount);
            if accepted {
                prop_assert!(state.minted_in_window <= state.quota_amount);
            } else {
                prop_assert!(state.minted_in_window <= state.quota_amount);
            }
        }

        #[test]
        fn only_master_can_rotate_roles(
            master in 1u64..1000,
            outsider in 1001u64..2000,
            new_value in 1u64..3000,
        ) {
            let mut state = RoleState {
                master,
                pauser: master,
                burner: master,
                blacklister: master,
                seizer: master,
            };

            prop_assert!(!state.set_role(outsider, Role::Pauser, new_value));
            prop_assert!(state.set_role(master, Role::Seizer, new_value));
            prop_assert_eq!(state.seizer, new_value);
        }

        #[test]
        fn transfer_master_authority_changes_write_permissions(
            original_master in 1u64..1000,
            new_master in 1001u64..2000,
        ) {
            let mut state = RoleState {
                master: original_master,
                pauser: original_master,
                burner: original_master,
                blacklister: original_master,
                seizer: original_master,
            };

            prop_assert!(state.transfer_master(original_master, new_master));
            prop_assert!(!state.set_role(original_master, Role::Pauser, original_master));
            prop_assert!(state.set_role(new_master, Role::Pauser, new_master));
            prop_assert_eq!(state.pauser, new_master);
        }
    }
}
