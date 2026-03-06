import re, collections, sys

text = open('src/app/page.tsx', encoding='utf-8').read()

# SVG size: inline w-[1em] h-[1em] align-[-0.15em] — scales with surrounding text size
def s(paths):
    return f'<svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>'

replacements = [
    # 🎬 clapperboard
    ('🎬', s('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/>')),
    # 🎞️ film strip
    ('🎞️', s('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/>')),
    ('🎞', s('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/>')),
    # 📅 calendar
    ('📅', s('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>')),
    # 🧾 receipt
    ('🧾', s('<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/>')),
    # 📊 bar chart
    ('📊', s('<path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-5"/>')),
    # 💰 money / coin
    ('💰', s('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/>')),
    # 👥 users
    ('👥', s('<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/>')),
    # 📋 clipboard
    ('📋', s('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/>')),
    # 📈 trending up
    ('📈', s('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>')),
    # 📉 trending down
    ('📉', s('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>')),
    # ⚠️ / ⚠ warning
    ('⚠️', s('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>')),
    ('⚠', s('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>')),
    # ✔️ checkmark
    ('✔️', s('<polyline points="20 6 9 17 4 12"/>')),
    ('✔', s('<polyline points="20 6 9 17 4 12"/>')),
    ('✓', s('<polyline points="20 6 9 17 4 12"/>')),
    # 👤 user
    ('👤', s('<circle cx="12" cy="8" r="4"/><path d="M4 20v-2a8 8 0 0 1 16 0v2"/>')),
    # ➕ plus
    ('➕', s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')),
    # 🏷 tag
    ('🏷', s('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/>')),
    # 🏢 building
    ('🏢', s('<rect x="3" y="2" width="18" height="20"/><path d="M9 22V12h6v10M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1"/>')),
    # 💾 floppy disk / save
    ('💾', s('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>')),
    # 🏦 bank / columns
    ('🏦', s('<path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>')),
    # 🏠 home
    ('🏠', s('<path d="M3 9.5L12 3l9 6.5V21H3V9.5Z"/><path d="M9 21V12h6v9"/>')),
    # 💼 briefcase
    ('💼', s('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 13v2M8 13h8"/>')),
    # 🧧 → envelope (chi phí / cost)
    ('🧧', s('<rect x="2" y="5" width="20" height="14" rx="2"/><polyline points="2 5 12 14 22 5"/>')),
    # 🔗 link
    ('🔗', s('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')),
    # 💵 banknote
    ('💵', s('<rect x="1" y="4" width="22" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M1 9h5M18 9h5M1 15h5M18 15h5"/>')),
    # 🪪 id card
    ('🪪', s('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h5M14 14h3"/>')),
    # 🥇 gold → medal 1
    ('🥇', s('<circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>')),
    # 🥈 silver → medal 2
    ('🥈', s('<circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>')),
    # 🥉 bronze → medal 3
    ('🥉', s('<circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>')),
    # 🏆 trophy
    ('🏆', s('<path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6Z"/><path d="M12 15v3M9 18h6"/>')),
    # ⏳ hourglass
    ('⏳', s('<path d="M5 2h14M5 22h14"/><path d="M5 2l7 10 7-10M5 22l7-10 7 10"/>')),
]

result = text
for emoji, svg in replacements:
    count = result.count(emoji)
    if count:
        print(f'  {emoji}  → {count} replacements')
    result = result.replace(emoji, svg)

remaining = re.findall(r'[\U0001F000-\U0001FFFF\U00002600-\U000027BF\U00002B00-\U00002BFF\u2300-\u23FF]', result)
c = collections.Counter(remaining)
if c:
    print('REMAINING EMOJIS:', dict(c))
else:
    print('All emojis replaced!')

open('src/app/page.tsx', 'w', encoding='utf-8').write(result)
print('Done. File size:', len(result))
