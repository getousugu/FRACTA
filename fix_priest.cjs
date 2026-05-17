const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/data/characters.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const priest = data.find(c => c.id === 'char_priest');
if (priest) {
  // S1: Remove unlocks, add max_uses_per_turn
  const s1 = priest.skills.find(s => s.id === 'char_priest_s1_combo');
  if (s1) {
    s1.unlocks = [];
    s1.max_uses_per_turn = 2;
  }
  // Remove s1_second from derived_skills
  priest.derived_skills = priest.derived_skills.filter(s => s.id !== 'char_priest_s1_second');
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log('Fixed char_priest S1 successfully');
