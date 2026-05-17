import type { SkillHandler, PassiveHandler } from '../../types';
import {
  char_route_j_skill_handlers,
  char_route_j_passive_handlers,
} from './char_route_j';
import {
  char_fighter_skill_handlers,
  char_mage_skill_handlers,
  char_fighter_passive_handlers,
  char_mage_passive_handlers,
} from './char_simple';
import {
  char_chrono_witch_skill_handlers,
  char_chrono_witch_passive_handlers,
} from './char_chrono_witch';
import { char_epp_skill_handlers, char_epp_passive_handlers } from './char_epp';
import {
  char_pyro_test_subject_skill_handlers,
  char_pyro_test_subject_passive_handlers,
} from './char_pyro_test_subject';
import {
  char_loran_skill_handlers,
  char_loran_passive_handlers,
} from './char_loran';
import {
  char_indicate_skill_handlers,
  char_indicate_passive_handlers,
} from './char_indicate';
import {
  char_priest_skill_handlers,
  char_priest_passive_handlers,
} from './char_priest';
import {
  char_shin_skill_handlers,
  char_shin_passive_handlers,
} from './char_shin';
import {
  char_deal_skill_handlers,
  char_deal_passive_handlers,
} from './char_deal';
import {
  char_crimson_stalker_skill_handlers,
  char_crimson_stalker_passive_handlers,
} from './char_crimson_stalker';

// ============================================================
// レジストリ型
// ============================================================
export type HandlerRegistry = {
  skillHandlers: Record<string, SkillHandler>;
  passiveHandlers: Record<string, Record<string, PassiveHandler>>;
};

let _registry: HandlerRegistry | null = null;

export function getSkillHandlerRegistry(): HandlerRegistry {
  if (_registry) return _registry;

  _registry = {
    skillHandlers: {
      ...char_route_j_skill_handlers,
      ...char_fighter_skill_handlers,
      ...char_mage_skill_handlers,
      ...char_chrono_witch_skill_handlers,
      ...char_epp_skill_handlers,
      ...char_pyro_test_subject_skill_handlers,
      ...char_loran_skill_handlers,
      ...char_indicate_skill_handlers,
      ...char_priest_skill_handlers,
      ...char_shin_skill_handlers,
      ...char_deal_skill_handlers,
      ...char_crimson_stalker_skill_handlers,
    },
    passiveHandlers: {
      char_route_j: char_route_j_passive_handlers,
      char_fighter: char_fighter_passive_handlers,
      char_mage: char_mage_passive_handlers,
      char_chrono_witch: char_chrono_witch_passive_handlers,
      char_epp: char_epp_passive_handlers,
      char_pyro_test_subject: char_pyro_test_subject_passive_handlers,
      char_loran: char_loran_passive_handlers,
      char_indicate: char_indicate_passive_handlers,
      char_priest: char_priest_passive_handlers,
      char_shin: char_shin_passive_handlers,
      char_deal: char_deal_passive_handlers,
      char_crimson_stalker: char_crimson_stalker_passive_handlers,
    },
  };

  return _registry;
}

export function getSkillHandler(skillId: string): SkillHandler | undefined {
  return getSkillHandlerRegistry().skillHandlers[skillId];
}
