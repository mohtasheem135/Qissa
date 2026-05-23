-- =============================================================================
-- Qissa — initial seed data
-- =============================================================================
-- 13 languages, 28 writer-style tones, and the ai_config singleton.
-- Idempotent (ON CONFLICT DO NOTHING) so re-running this migration on a
-- partially-populated database is safe.
--
-- Sources for the writer descriptions: docs/01-requirements.md §3.2 and the
-- requirements doc's Phase 3 brief.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Languages
-- -----------------------------------------------------------------------------
-- Font stacks mirror docs/01-requirements.md §3.11 exactly.

insert into public.languages
  (code, name_english, name_native, direction, font_family, font_family_reading, is_active, display_order)
values
  ('en', 'English',   'English',       'ltr',
   'Inter, system-ui, sans-serif',
   'Lora, "Source Serif Pro", Georgia, serif', true, 10),

  ('hi', 'Hindi',     'हिन्दी',          'ltr',
   '"Noto Sans Devanagari", system-ui, sans-serif',
   '"Tiro Devanagari Hindi", "Noto Serif Devanagari", serif', true, 20),

  ('ur', 'Urdu',      'اُردُو',           'rtl',
   '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif',
   '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif', true, 30),

  ('ar', 'Arabic',    'العربية',        'rtl',
   '"Noto Naskh Arabic", Amiri, serif',
   '"Noto Naskh Arabic", Amiri, serif', true, 40),

  ('bn', 'Bengali',   'বাংলা',          'ltr',
   '"Noto Sans Bengali", system-ui, sans-serif',
   '"Tiro Bangla", "Noto Serif Bengali", serif', true, 50),

  ('ta', 'Tamil',     'தமிழ்',          'ltr',
   '"Noto Sans Tamil", system-ui, sans-serif',
   '"Noto Serif Tamil", "Tiro Tamil", serif', true, 60),

  ('or', 'Odia',      'ଓଡ଼ିଆ',           'ltr',
   '"Noto Sans Oriya", system-ui, sans-serif',
   '"Noto Sans Oriya", serif', true, 70),

  ('pa', 'Punjabi',   'ਪੰਜਾਬੀ',          'ltr',
   '"Noto Sans Gurmukhi", system-ui, sans-serif',
   '"Noto Serif Gurmukhi", serif', true, 80),

  ('mr', 'Marathi',   'मराठी',          'ltr',
   '"Noto Sans Devanagari", system-ui, sans-serif',
   '"Tiro Devanagari Marathi", "Noto Serif Devanagari", serif', true, 90),

  ('gu', 'Gujarati',  'ગુજરાતી',         'ltr',
   '"Noto Sans Gujarati", system-ui, sans-serif',
   '"Noto Serif Gujarati", serif', true, 100),

  ('te', 'Telugu',    'తెలుగు',         'ltr',
   '"Noto Sans Telugu", system-ui, sans-serif',
   '"Noto Serif Telugu", serif', true, 110),

  ('kn', 'Kannada',   'ಕನ್ನಡ',           'ltr',
   '"Noto Sans Kannada", system-ui, sans-serif',
   '"Noto Serif Kannada", serif', true, 120),

  ('ml', 'Malayalam', 'മലയാളം',         'ltr',
   '"Noto Sans Malayalam", system-ui, sans-serif',
   '"Noto Serif Malayalam", serif', true, 130)
on conflict (code) do nothing;


-- -----------------------------------------------------------------------------
-- Tones (28 writer-style presets)
-- -----------------------------------------------------------------------------

-- Hindi ---------------------------------------------------------------------
insert into public.tones (language_code, name, display_name, description, prompt_fragment) values
  ('hi', 'Premchand', 'मुंशी प्रेमचंद',
   'Foundational Hindi-Urdu realist; rural Indian life, moral weight, plain diction.',
   'Write in the style of Munshi Premchand: simple yet emotionally rich Hindi rooted in rural Indian life, with vivid character portraits, moral undertones, and natural dialogue. Use everyday Hindi-Urdu vocabulary; avoid heavy Sanskrit-derived words. Let compassion and gentle social observation guide every sentence.'),

  ('hi', 'Harivansh Rai Bachchan', 'हरिवंश राय बच्चन',
   'Lyrical, melancholic, songlike Hindi; cadence and feeling over plot.',
   'Write in the style of Harivansh Rai Bachchan: lyrical, evocative Hindi with a measured rhythm and a touch of melancholy. Favor imagery drawn from night, wine, and longing; let sentences breathe like verse even when the form is prose. Reach for warmth and metaphor over plainness.'),

  ('hi', 'Phanishwar Nath Renu', 'फणीश्वर नाथ रेणु',
   'Anchal regional realism; folk rhythms and dialect of eastern UP / Bihar.',
   'Write in the style of Phanishwar Nath Renu: rural Hindi steeped in the folk rhythms and dialect of eastern Uttar Pradesh and Bihar. Embrace onomatopoeia, song fragments, and untranslated local terms where they add color. The prose should feel like a village storyteller speaking aloud.'),

  ('hi', 'Krishna Sobti', 'कृष्णा सोबती',
   'Bold modernist Hindi inflected with Punjabi and Urdu; layered, sensual.',
   'Write in the style of Krishna Sobti: bold, modernist Hindi inflected with Punjabi and Urdu cadence. Sentences are layered, sensual, and unafraid of strong female interiority. Allow vocabulary from across the Hindi-Urdu spectrum; let rhythm and frankness drive the prose.'),

  ('hi', 'Mannu Bhandari', 'मन्नू भंडारी',
   'Intimate, urban middle-class Hindi; quiet feminine introspection.',
   'Write in the style of Mannu Bhandari: intimate, restrained Hindi of urban middle-class life. Favor introspection, small domestic gestures, and quiet emotional truth over drama. The diction is clear, contemporary, and lightly literary.'),

-- Urdu ----------------------------------------------------------------------
  ('ur', 'Saadat Hasan Manto', 'سعادت حسن منٹو',
   'Stark, unflinching realism; Partition, the streets, the brothels.',
   'Write in the style of Saadat Hasan Manto: stark, unflinching Urdu prose with short, hard sentences and pitiless honesty. Do not flinch from the cruelty or absurdity of the scene. Vocabulary is plain street Urdu — no decorative flourishes — and dialogue is sharp and economical.'),

  ('ur', 'Ismat Chughtai', 'عصمت چغتائی',
   'Colloquial Lucknowi Urdu; feminist mischief, domestic interiors.',
   'Write in the style of Ismat Chughtai: colloquial Lucknowi Urdu with the rhythms of women’s domestic conversation. Be mischievous, gossipy, and quietly subversive about gender and class. Embrace begumati zubaan turns of phrase and unforced humor.'),

  ('ur', 'Mirza Ghalib', 'مرزا غالب',
   'Classical Persianate Urdu; aphoristic, philosophical, ornate.',
   'Write in the style of Mirza Ghalib: classical Persianate Urdu, aphoristic and philosophically dense. Sentences are compressed and ornate, fond of paradox and metaphor. Use elevated Perso-Arabic vocabulary; the register should feel like literary correspondence from the late Mughal court.'),

  ('ur', 'Ibn-e-Safi', 'ابنِ صفی',
   'Pulpy, witty mystery Urdu; brisk, accessible, cinematic.',
   'Write in the style of Ibn-e-Safi: brisk, witty Urdu prose in the register of popular detective fiction. Keep sentences short and propulsive, dialogue snappy, and humor dry. Vocabulary is accessible modern Urdu with the occasional English loanword for color.'),

  ('ur', 'Quratulain Hyder', 'قرة العين حیدر',
   'Literary modernist Urdu; layered timeframes, lush historical sweep.',
   'Write in the style of Quratulain Hyder: literary modernist Urdu with a wide, civilizational sweep. Move easily between timeframes and registers; embrace long, music-rich sentences that fold history, memory, and culture together. Reach for refined Urdu vocabulary without becoming archaic.'),

-- Bengali --------------------------------------------------------------------
  ('bn', 'Rabindranath Tagore', 'রবীন্দ্রনাথ ঠাকুর',
   'Lyrical, philosophical Bengali; nature, devotion, gentle interiority.',
   'Write in the style of Rabindranath Tagore: lyrical, philosophical Bengali rich in imagery drawn from nature, seasons, and devotion. Sentences are unhurried and musical; the tone is contemplative and humane. Use a refined but accessible Bengali — Sadhu-influenced where it adds dignity, never stiff.'),

  ('bn', 'Sarat Chandra Chattopadhyay', 'শরৎচন্দ্র চট্টোপাধ্যায়',
   'Emotional social realism; accessible Bengali, women’s suffering, village life.',
   'Write in the style of Sarat Chandra Chattopadhyay: warm, emotionally accessible Bengali centered on village life and the inner lives of women. Use plain Cholito Bengali; let pathos arise from circumstance, not ornament. Dialogue should sound natural and lived-in.'),

  ('bn', 'Bibhutibhushan Bandyopadhyay', 'বিভূতিভূষণ বন্দ্যোপাধ্যায়',
   'Sensory pastoral Bengali; childhood, forests, gentle wonder.',
   'Write in the style of Bibhutibhushan Bandyopadhyay: sensory, pastoral Bengali alive to the smells, sounds, and small wonders of village and forest. Let the narrative move at the pace of a long walk; the diction is gentle, observational, and slightly nostalgic.'),

  ('bn', 'Mahasweta Devi', 'মহাশ্বেতা দেবী',
   'Politically charged Bengali; tribal voices, anger, journalistic edge.',
   'Write in the style of Mahasweta Devi: urgent, politically charged Bengali that gives voice to tribal and marginalized lives. The prose is hard-edged and journalistic, refusing sentiment. Use vocabulary that carries the weight of dispossession; let outrage breathe in the sentences.'),

-- Arabic --------------------------------------------------------------------
  ('ar', 'Naguib Mahfouz', 'نجيب محفوظ',
   'Cairo realism in measured MSA; philosophical undercurrents.',
   'Write in the style of Naguib Mahfouz: clear, measured Modern Standard Arabic that observes urban life — especially Cairo’s alleyways — with philosophical patience. Sentences are unhurried, dialogue dignified. Reach for psychological insight rather than ornament.'),

  ('ar', 'Khalil Gibran', 'جبران خليل جبران',
   'Mystical parabolic Arabic; ornate, biblical cadence.',
   'Write in the style of Khalil Gibran: mystical, parabolic Arabic with a biblical cadence and a teacher’s warmth. Embrace metaphor, rhetorical address, and short oracular paragraphs. The register should feel timeless rather than contemporary.'),

  ('ar', 'Tayeb Salih', 'الطيب صالح',
   'Sudanese modernist Arabic; postcolonial, lyrical, sensual.',
   'Write in the style of Tayeb Salih: lyrical Sudanese-flavored Arabic that braids village memory with postcolonial unease. Allow sensual detail, river imagery, and unhurried digression. The Arabic is literary but unmistakably rooted south of Cairo.'),

-- Tamil ---------------------------------------------------------------------
  ('ta', 'Kalki Krishnamurthy', 'கல்கி கிருஷ்ணமூர்த்தி',
   'Historical romance Tamil; sweeping, accessible, Chola-era vocabulary.',
   'Write in the style of Kalki Krishnamurthy: sweeping historical-romance Tamil that is accessible to ordinary readers yet rich in Chola-era courtly vocabulary. Dialogue is dramatic and noble; descriptions of temples, ships, and battles are vivid and confident.'),

  ('ta', 'Pudumaipithan', 'புதுமைப்பித்தன்',
   'Urban modernist Tamil; ironic, terse, psychological.',
   'Write in the style of Pudumaipithan: terse, ironic urban Tamil with a modernist suspicion of sentiment. Sentences are short, observational, often barbed; the focus is on the misfit, the moral exception, the small lie. Vocabulary is contemporary, lightly literary.'),

  ('ta', 'Jeyamohan', 'ஜெயமோகன்',
   'Contemporary literary Tamil; philosophical, dense, encyclopedic.',
   'Write in the style of Jeyamohan: dense, philosophical contemporary Tamil that moves easily between myth, science, and everyday detail. Long sentences are welcome when they earn their weight. The register is high-literary but the curiosity should feel restless and modern.'),

-- Odia ----------------------------------------------------------------------
  ('or', 'Fakir Mohan Senapati', 'ଫକୀର ମୋହନ ସେନାପତି',
   'Foundational Odia realism; gentle satire, village voice.',
   'Write in the style of Fakir Mohan Senapati: foundational Odia realism with a sly, gently satirical narrator who confides directly with the reader. Embrace village voice and proverbial speech; let irony do the heavy lifting rather than open judgment.'),

  ('or', 'Gopinath Mohanty', 'ଗୋପୀନାଥ ମହାନ୍ତି',
   'Lyrical Odia realism; tribal sensibility, forests, dignity.',
   'Write in the style of Gopinath Mohanty: lyrical Odia prose attuned to tribal life, forests, and the dignity of the dispossessed. The tone is humane and unhurried; vocabulary draws on rural and Adivasi rhythms where they belong.'),

-- Punjabi -------------------------------------------------------------------
  ('pa', 'Amrita Pritam', 'ਅੰਮ੍ਰਿਤਾ ਪ੍ਰੀਤਮ',
   'Sensual lyrical Punjabi; Partition grief, love, womanhood.',
   'Write in the style of Amrita Pritam: lyrical, sensual Punjabi that carries the long ache of Partition and the inner life of women. Sentences are warm, image-laden, and unafraid of vulnerability. Let folk cadence and the soil of the Punjab show through.'),

  ('pa', 'Bhai Vir Singh', 'ਭਾਈ ਵੀਰ ਸਿੰਘ',
   'Devotional Punjabi; Sikh ethos, naturalistic reverence.',
   'Write in the style of Bhai Vir Singh: devotional, reverent Punjabi infused with Sikh ethos and the imagery of mountains, rivers, and the divine name. The register is dignified and meditative; vocabulary draws naturally from Gurbani without becoming opaque.'),

-- English -------------------------------------------------------------------
  ('en', 'Ernest Hemingway', 'Ernest Hemingway',
   'Terse, declarative English; iceberg theory, concrete nouns.',
   'Write in the style of Ernest Hemingway: terse, declarative English built from concrete nouns and active verbs. Strip away modifiers; trust the reader to feel what is left unsaid. Dialogue is clipped and load-bearing; sentences are short and rhythmic.'),

  ('en', 'J. R. R. Tolkien', 'J. R. R. Tolkien',
   'Mythic, formal English; archaic register, world-built diction.',
   'Write in the style of J. R. R. Tolkien: mythic, formal English with an elevated, faintly archaic register. Favor compound sentences, vivid landscape, and a sense of deep history beneath every name. The diction should feel as if drawn from an older tradition without becoming a parody of it.'),

  ('en', 'J. D. Salinger', 'J. D. Salinger',
   'Intimate colloquial English; first-person voice, urban American.',
   'Write in the style of J. D. Salinger: intimate, colloquial American English in a confiding first-person voice. Embrace digression, self-interruption, and the small embarrassments of adolescence and early adulthood. Avoid grand vocabulary; trust the rhythm of speech.'),

  ('en', 'George Orwell', 'George Orwell',
   'Clear, plain English; political clarity, no ornament.',
   'Write in the style of George Orwell: clear, plain English that prefers a short Saxon word to a long Latinate one, and a concrete image to a vague abstraction. The voice is direct and morally alert; ornament is suspect. Sentences should mean exactly what they say.')
on conflict (language_code, name) do nothing;


-- -----------------------------------------------------------------------------
-- ai_config singleton
-- -----------------------------------------------------------------------------
insert into public.ai_config (id, default_provider, default_model)
values ('00000000-0000-0000-0000-000000000001', 'gemini', 'gemini-2.0-flash')
on conflict (id) do nothing;
