const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/data/characters.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const priest = {
  id: "char_priest",
  name: "神父",
  element: "light",
  hp: 800,
  atk: 102,
  def: 0,
  flavor_text: "神の代行者を名乗る男。",
  custom_resources: [
    {
      id: "sin",
      name: "罪",
      initial_value: 0,
      min: 0,
      max: 1000,
      display: "gauge"
    }
  ],
  passives: [
    {
      id: "char_priest_passive_protection",
      name: "加護？",
      trigger: "on_turn_start",
      description: "自身のターン開始時、最大HPの5%回復する。",
      flavor_text: "「信仰するものに等しく注がれる愛。それを独占したいと思うのもまた人間の性」"
    },
    {
      id: "char_priest_passive_godslayer",
      name: "神殺し",
      trigger: "passive_while_active",
      description: "常時受けるダメージを20固定値で減少させる。"
    },
    {
      id: "char_priest_passive_condemnation",
      name: "断罪",
      trigger: "on_turn_end", // Used for descriptions mostly
      description: "固有リソース「罪」(最大値1000)を持つ。相手から受けたダメージを罪に加算する。罪/10だけ与えるダメージが固定値で加算される。",
      flavor_text: "「罪を償う時だ」"
    },
    {
      id: "char_priest_passive_god",
      name: "特殊パッシブ:神",
      trigger: "on_death",
      description: "死亡時に発動。パッシブ「加護？」、「神殺し」を無効化。全てのバフ、デバフを除去し、受け付けなくなる。HP最大値を500に設定、atkを0に設定し、S2,3,4を変更。キャラクター名を「神」に変更。属性を無に変更。変化後3ターン目終了時に死亡する。このキャラクターの死亡時、味方全体に100ダメージ。このキャラクターは蘇生効果を受け付けない。"
    }
  ],
  skills: [
    {
      id: "char_priest_s1_combo",
      name: "連撃",
      cost: 0,
      description: "10の固定ダメージを与える。パッシブ「断罪」で与える固定ダメージが20%増加。【1ターンに2回使用可能】",
      flavor_text: "「この程度か？」",
      unlocks: [
        { "skillId": "char_priest_s1_second", "available": "same_turn" }
      ]
    },
    {
      id: "char_priest_s2_punishment_proxy",
      name: "神罰-代行",
      cost: 1,
      description: "この攻撃は闇属性として扱われる。ATK×1.0ダメージ。",
      flavor_text: "「我、代行者故に」",
      unlocks: []
    },
    {
      id: "char_priest_s3_to_where_it_belongs",
      name: "あるべきところへ",
      cost: 2,
      description: "ATK×1.2ダメージ。次のターン、相手のATKを10%上昇させる。相手の次に受けるダメージ+25%。",
      flavor_text: "「ただ還すのみ」",
      unlocks: []
    },
    {
      id: "char_priest_s4_liquidation",
      name: "精算",
      cost: 3,
      description: "ATK×1.5ダメージ。罪を100増加させる。HPを最大値の10%回復する。",
      flavor_text: "「私の罪を」",
      unlocks: []
    }
  ],
  derived_skills: [
    {
      id: "char_priest_s1_second",
      name: "連撃 (2回目)",
      cost: 0,
      description: "10の固定ダメージを与える。パッシブ「断罪」で与える固定ダメージが20%増加。",
      flavor_text: "「この程度か？」",
      unlocked_by: "char_priest_s1_combo",
      available: "same_turn"
    },
    {
      id: "char_priest_s2_god_punishment",
      name: "神罰",
      cost: 3,
      description: "相手の最大HPの50%ダメージ。",
      unlocked_by: "char_priest_passive_god",
      available: "permanent"
    },
    {
      id: "char_priest_s3_reduction",
      name: "還元",
      cost: 2,
      description: "罪を全て消耗し、消耗した数値だけダメージ。与えたダメージが400以下なら、与えたダメージの30%を再度与える。",
      unlocked_by: "char_priest_passive_god",
      available: "permanent"
    },
    {
      id: "char_priest_s4_incomplete",
      name: "不完全",
      cost: 1,
      description: "神のパッシブを無効化し、神父の状態に戻る。HPは最大値の50%となる。このスキル発動後、神のパッシブによる復活効果は無効化され、ターン終了。",
      unlocked_by: "char_priest_passive_god",
      available: "permanent"
    }
  ]
};

data.push(priest);
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log('Added char_priest successfully');
