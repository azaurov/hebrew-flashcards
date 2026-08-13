import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/* =======================================================================
   VOCABULARY — transcribed from the workbook pages.
   Format: ['Hebrew', 'transliteration', 'meaning']
   ======================================================================= */

const VOCAB = {

  set1: { label:'ב ד ר ש ת', tag:'Letters ב ד ר ש ת', words:[
    ['בַּר','bar','son'],
    ['בַּת','bat','daughter'],
    ['בַּד','bad','linen'],
    ['רַב','rav','rabbi'],
    ['דָּת','dat','religion'],
    ['שָׁר','shar','sings'],
    ['שַׂר','sar','leader'],
    ['מַר','mar','Mr.'],
    ['תָּמָר','tamar','date (the fruit)'],
    ['שֵׁשׁ','shesh','six'],
    ['שֵׁב','shev','sit!'],
    ['שֵׁת','Shet','Seth'],
    ['שָׂת','sat','put'],
    ['שָׁב','shav','returned'],
    ['שָׂשׂ','sas','glad'],
    ['רֵשׁ','resh','the letter resh — "R"'],
    ['לָתֵת','latet','to give'],
    ['שָׁרֵת','sharet','service'],
    ['רַבַּת','rabat','many (poetic form)'],
    ['שַׁבָּת','Shabbat','Sabbath'],
    ['רָתַת','ratat','to tremble'],
    ['בָּשָׂר','basar','meat'],
    ['בָּרָד','barad','hail'],
    ['דָּבָר','davar','thing; word'],
    ['שָׁבַר','shavar','broke'],
    ['שָׁמַר','shamar','guarded'],
    ['שַׁמָּשׁ','shamash','attendant'],
    ['לָבַשׁ','lavash','wore'],
    ['לָמַד','lamad','studied'],
    ['לֵבָב','levav','heart'],
    ['בַּלֵּבָב','balevav','in the heart'],
    ['מָשָׁל','mashal','proverb'],
    ['דָּרַשׁ','darash','explained'],
    ['דַּבֵּר','daber','speak!']
  ]},

  set2: { label:'ג נ', tag:'Letters ג נ', words:[
    ['גַּן','gan','garden'],
    ['גַּם','gam','also'],
    ['גֵּר','ger','stranger'],
    ['גּוֹי','goy','nation'],
    ['נֵר','ner','candle'],
    ['בְּנֵי','b\'nei','children of'],
    ['לָנוּ','lanu','to us'],
    ['רַגְלֵינוּ','ragleinu','our feet'],
    ['דּוֹרֵנוּ','dorenu','our age; our generation'],
    ['אֲבוֹתֵינוּ','avoteinu','our fathers'],
    ['גָּר','gar','lives (dwells)'],
    ['לָגוּר','lagur','to live (dwell)'],
    ['לְנַגֵּן','l\'nagen','to play (an instrument)'],
    ['מְנַגֵּן','m\'nagen','plays (an instrument)'],
    ['גָּדוֹל','gadol','great, big'],
    ['גָּדַל','gadal','grew, became big'],
    ['גַּדְּלוּ','gad\'lu','magnify!'],
    ['גָּאוֹן','ga\'on','genius; gaon — a rabbinic title'],
    ['גּוֹאֵל','go\'el','redeemer'],
    ['מָגֵן','magen','shield'],
    ['גְּמָרָא','G\'mara','part of the Talmud'],
    ['גָּמָל','gamal','camel'],
    ['תַּרְנְגֹל','tarn\'gol','rooster'],
    ['אֲגוֹרוֹת','agorot','Israeli coins'],
    ['נוֹדֵד','noded','wanders'],
    ['נָדַד','nadad','wandered'],
    ['נוֹשֵׂא','nose','carries'],
    ['נָשָׂא','nasa','carried'],
    ['נוֹתֵן','noten','gives'],
    ['נָתַן','natan','gave'],
    ['גּוֹמֵר','gomer','finishes'],
    ['גָּמַר','gamar','finished']
  ]},

  set3: { label:'א ה ח ע י', tag:'Letters א ה ח ע י', words:[
    ['חָבֵר','chaver','friend (masc.)'],
    ['חֲבֵרָה','chavera','friend (fem.)'],
    ['יֶלֶד','yeled','boy'],
    ['יַלְדָּה','yalda','girl'],
    ['אַתְּ','at','you (fem.)'],
    ['אַתָּה','ata','you (masc.)'],
    ['אֱלֹהֵי','Elohei','God of'],
    ['אֱלֹהֵינוּ','Eloheinu','our God'],
    ['הַלְלוּ','hal\'lu','praise!'],
    ['הַלְלוּיָהּ','hal\'luyah','praise ye the Lord!'],
    ['אוֹהֵב','ohev','likes (masc.)'],
    ['אוֹהֶבֶת','ohevet','likes (fem.)'],
    ['חוֹשֵׁב','choshev','thinks (masc.)'],
    ['חוֹשֶׁבֶת','choshevet','thinks (fem.)'],
    ['תּוֹרָה','Torah','Torah'],
    ['הַיּוֹם','hayom','today'],
    ['מָחָר','machar','tomorrow'],
    ['חַג','chag','holiday'],
    ['תּוֹדָה','toda','thank you'],
    ['חֹדֶשׁ','chodesh','month'],
    ['חָדָשׁ','chadash','new'],
    ['חֶדֶר','cheder','room'],
    ['מַחְבֶּרֶת','machberet','notebook'],
    ['אֶתְרוֹג','etrog','etrog'],
    ['הַלֵּילוֹת','haleilot','the nights'],
    ['הַגָּדָה','Hagada','narrative'],
    ['אֶחָד','echad','one (masc.)'],
    ['אַחַת','achat','one (fem.)'],
    ['חָמֵשׁ','chamesh','five'],
    ['שֶׁבַע','sheva','seven'],
    ['הַשָּׁעָה','hasha\'a','the time'],
    ['עֶרֶב','erev','evening'],
    ['רֶגֶל','regel','foot'],
    ['גְּבֶרֶת','g\'veret','Mrs.'],
    ['לֶחֶם','lechem','bread'],
    ['שֶׁמֶשׁ','shemesh','sun'],
    ['רוּחַ','ruach','spirit; wind'],
    ['שָׂמֵחַ','sameach','happy'],
    ['לוּחַ','luach','blackboard'],
    ['שׁוֹלֵחַ','sholeach','send'],
    ['יָרֵחַ','yareach','moon']
  ]},

  set4: { label:'כ ך', tag:'Letter כ', words:[
    ['מֶלֶךְ','melech','king'],
    ['מַלְכֵּנוּ','malkenu','our king'],
    ['מַלְכוּת','malchut','kingdom'],
    ['מַלְכוּתוֹ','malchuto','His kingdom'],
    ['בָּרְכוּ','bar\'chu','bless!'],
    ['בָּרוּךְ','baruch','blessed'],
    ['כְּבוֹד','k\'vod','glory'],
    ['כְּבוֹדוֹ','k\'vodo','His glory'],
    ['כָּל','kol','all'],
    ['בְּכָל','b\'chol','with all'],
    ['וּבְכָל','uv\'chol','and with all'],
    ['שֶׁבְּכָל','sheb\'chol','that on all'],
    ['כֵּן','ken','yes'],
    ['כֹּהֵן','kohen','kohen, priest'],
    ['כַּוָּנָה','kavana','intention'],
    ['כֹּחַ','ko\'ach','strength'],
    ['כָּחֹל','kachol','blue'],
    ['כֹּתֶל','kotel','wall'],
    ['כֶּתֶר','keter','crown'],
    ['כָּשֵׁר','kasher','kosher'],
    ['דֶּרֶךְ','derech','road'],
    ['בֶּרֶךְ','berech','knee'],
    ['כּוֹתֵב','kotev','he writes'],
    ['כּוֹתֶבֶת','kotevet','she writes'],
    ['אוֹכֵל','ochel','he eats'],
    ['אוֹכֶלֶת','ochelet','she eats'],
    ['עַכְשָׁו','achshav','now'],
    ['כְּבָר','k\'var','already'],
    ['כַּמָּה','kama','how many?'],
    ['כְּמוֹ','k\'mo','like, as'],
    ['כּוֹבַע','kova','hat'],
    ['כַּדּוּר','kadur','ball'],
    ['כֶּלֶב','kelev','dog'],
    ['אֶשְׁכּוֹל','eshkol','bunch of grapes'],
    ['חֹשֶׁךְ','choshech','darkness'],
    ['חָכָם','chacham','wise'],
    ['נָכוֹן','nachon','correct'],
    ['יֵשׁ לְךָ','yesh l\'cha','you have (masc.)'],
    ['יֵשׁ לָךְ','yesh lach','you have (fem.)'],
    ['מַה שְׁלוֹמְךָ','ma sh\'lomcha','How are you? (masc.)'],
    ['מַה שְׁלוֹמֵךְ','ma sh\'lomech','How are you? (fem.)'],
    ['מַה שְׁמֵךְ','ma sh\'mech','What\'s your name? (fem.)']
  ]},

  set5: { label:'פ ף', tag:'Letter פ', words:[
    ['שׁוֹפָר','shofar','shofar'],
    ['פְּרִי','p\'ri','fruit'],
    ['פֹּה','po','here'],
    ['עִפָּרוֹן','iparon','pencil'],
    ['פּוּרִים','Purim','Purim'],
    ['חֲנֻכָּה','Chanuka','Chanukah'],
    ['חֻמָּשׁ','Chumash','the Five Books of Moses'],
    ['פָּרָשָׁה','parasha','chapter, portion'],
    ['יָפֶה','yafe','nice (masc.)'],
    ['יָפָה','yafa','nice (fem.)'],
    ['רוֹפֵא','rofe','doctor'],
    ['חָפְשִׁי','chofshi','free'],
    ['אֵיפֹה','eifo','where is?'],
    ['אֶפְשָׁר','efshar','maybe'],
    ['אֲפִילוּ','afilu','even'],
    ['לִפְעָמִים','lif\'amim','sometimes'],
    ['כִּפָּה','kipa','skull cap'],
    ['פֶּה','pe','mouth'],
    ['פָּנִים','panim','face'],
    ['אֲרֻחָה','arucha','meal'],
    ['מִשְׁפָּחָה','mishpacha','family'],
    ['תְּפִלָּה','t\'fila','prayer'],
    ['פּוֹתֵחַ','poteach','opens'],
    ['לַיְלָה','laila','night']
  ]},

  set8: { label:'ל מ ם', tag:'Letters ל מ', words:[
    ['שָׁם','sham','there'],
    ['שָׂם','sam','puts'],
    ['שֵׁם','shem','name'],
    ['דָּם','dam','blood'],
    ['רָם','ram','high'],
    ['מָרוֹם','marom','high place'],
    ['דָּרוֹם','darom','south'],
    ['דּוֹד','dod','uncle'],
    ['דּוֹר','dor','generation'],
    ['בָּרוּר','barur','clear'],
    ['שָׁלוֹם','shalom','greetings; peace'],
    ['שָׁלֵם','shalem','whole'],
    ['שָׁלֹשׁ','shalosh','three'],
    ['לוֹמֵד','lomed','studies'],
    ['לוֹבֵשׁ','lovesh','wears'],
    ['מוֹשָׁב','moshav','settlement'],
    ['מַבּוּל','mabul','flood'],
    ['מָרוֹר','maror','bitter herbs'],
    ['לוּלָב','lulav','lulav'],
    ['תּוֹרָתוֹ','Torato','His Torah']
  ]},

  set6: { label:'ט ק', tag:'Letters ט ק', words:[
    ['טוֹב','tov','good'],
    ['בֹּקֶר טוֹב','boker tov','good morning'],
    ['עֶרֶב טוֹב','erev tov','good evening'],
    ['לַיְלָה טוֹב','laila tov','good night'],
    ['יוֹם טוֹב','yom tov','holiday'],
    ['שְׁבָט','Sh\'vat','a Hebrew month'],
    ['ט״וּ בִּשְׁבָט','Tu Bishvat','the 15th of Shevat'],
    ['טֵבֵת','Tevet','a Hebrew month'],
    ['קָדוֹשׁ','kadosh','holy'],
    ['קִדּוּשׁ','Kidush','sanctification'],
    ['קֹדֶשׁ','kodesh','holiness'],
    ['קִדְּשָׁנוּ','kid\'shanu','sanctified us'],
    ['מְקַדֵּשׁ','m\'kadesh','sanctifies'],
    ['טַלִּית','talit','prayer shawl'],
    ['לְהַדְלִיק','l\'hadlik','to kindle'],
    ['קוֹרֵא','kore','reads (masc.)'],
    ['קוֹרֵאת','koret','reads (fem.)'],
    ['בְּבַקָּשָׁה','b\'vakasha','please'],
    ['יְרָקוֹת','y\'rakot','vegetables'],
    ['אֲפִיקוֹמָן','afikoman','Afikomen — matzah eaten after the Seder meal'],
    ['לִקְרֹא','likro','to read'],
    ['הַקָּפוֹת','hakafot','processions'],
    ['קָפֶה','kafe','coffee'],
    ['מִשְׁפָּט','mishpat','judgment'],
    ['נְקֻדּוֹת','n\'kudot','vowels'],
    ['קַל','kal','easy'],
    ['קָטָן','katan','little (masc.)'],
    ['קְטַנָּה','k\'tana','little (fem.)'],
    ['קֶרֶן','keren','fund; horn'],
    ['נָטַע','nata','planted (masc.)'],
    ['יַעֲקֹב','Ya\'akov','Jacob']
  ]},

  set7: { label:'צ', tag:'Letter צ', words:[
    ['מַצּוֹת','matzot','matzot'],
    ['מִצְוָה','mitzva','mitzvah; commandment'],
    ['בַּר מִצְוָה','Bar Mitzva','Bar Mitzvah'],
    ['בַּת מִצְוָה','Bat Mitzva','Bat Mitzvah'],
    ['הַמּוֹצִיא','HaMotzi','the blessing recited over bread'],
    ['אֶרֶץ','eretz','land'],
    ['אֶרֶץ יִשְׂרָאֵל','Eretz Yisra\'el','the Land of Israel']
  ]},

  names: { label:'Names & אֵין כֵּאלֹהֵינוּ', tag:'Names of God', words:[
    ['אֲדֹנָי','Adonai','Lord'],
    ['יְיָ','Adonai','the Lord — the written form, always read Adonai'],
    ['שַׁדַּי','Shaddai','Shaddai, a name of God'],
    ['יִשְׂרָאֵל','Yisra\'el','Israel'],
    ['מוֹשִׁיעַ','moshia','savior'],
    ['מוֹשִׁיעֵנוּ','moshi\'enu','our Savior'],
    ['אֲדוֹנֵינוּ','Adoneinu','our Lord'],
    ['אֵין','ein','none'],
    ['מִי','mi','who'],
    ['נוֹדֶה','node','we will give thanks'],
    ['אַתָּה הוּא','ata hu','You are He']
  ]},

  prayers: { label:'Prayers', tag:'Prayer', words:[
    ['שְׁמַע יִשְׂרָאֵל יְיָ אֱלֹהֵינוּ יְיָ אֶחָד','Sh\'ma Yisra\'el, Adonai Eloheinu, Adonai echad','Hear, O Israel: The Lord is our God, the Lord is One.'],
    ['בָּרוּךְ שֵׁם כְּבוֹד מַלְכוּתוֹ לְעוֹלָם וָעֶד','Baruch shem k\'vod malchuto l\'olam va\'ed','Blessed be His name whose glorious kingdom is forever and ever.'],
    ['בָּרְכוּ אֶת יְיָ הַמְבֹרָךְ','Bar\'chu et Adonai ham\'vorach','Bless the Lord, who is blessed!'],
    ['בָּרוּךְ יְיָ הַמְבֹרָךְ לְעוֹלָם וָעֶד','Baruch Adonai ham\'vorach l\'olam va\'ed','Blessed be the Lord who is blessed for ever and ever.'],
    ['בָּרוּךְ אַתָּה יְיָ','Baruch ata Adonai','Blessed are You, Lord'],
    ['אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם','Eloheinu melech ha\'olam','our God, King of the universe'],
    ['אֲשֶׁר בָּחַר בָּנוּ','asher bachar banu','who chose us'],
    ['מִכָּל הָעַמִּים','mikol ha\'amim','from all the peoples'],
    ['וְנָתַן לָנוּ אֶת תּוֹרָתוֹ','v\'natan lanu et torato','and gave us His Torah'],
    ['בָּרוּךְ אַתָּה יְיָ נוֹתֵן הַתּוֹרָה','Baruch ata Adonai noten haTorah','Blessed are You, Lord, who gives the Torah'],
    ['אֲשֶׁר נָתַן לָנוּ תּוֹרַת אֱמֶת','asher natan lanu torat emet','who has given us the Torah of truth'],
    ['וְחַיֵּי עוֹלָם נָטַע בְּתוֹכֵנוּ','v\'chayei olam nata b\'tochenu','and has implanted within us eternal life'],
    ['אֲשֶׁר בָּחַר בִּנְבִיאִים טוֹבִים','asher bachar bin\'vi\'im tovim','who has chosen good prophets'],
    ['וְרָצָה בְדִבְרֵיהֶם הַנֶּאֱמָרִים בֶּאֱמֶת','v\'ratza v\'divreihem hane\'emarim be\'emet','and has found delight in their words spoken in truth'],
    ['בָּרוּךְ אַתָּה יְיָ הַבּוֹחֵר בַּתּוֹרָה','Baruch ata Adonai habocher baTorah','Blessed are You, Lord, who has chosen the Torah'],
    ['וּבְמֹשֶׁה עַבְדּוֹ וּבְיִשְׂרָאֵל עַמּוֹ','uv\'Moshe avdo uv\'Yisra\'el amo','and Moses His servant and Israel His people'],
    ['וּבִנְבִיאֵי הָאֱמֶת וָצֶדֶק','uvin\'vi\'ei ha\'emet vatzedek','and prophets of truth and righteousness']
  ]},

  blessings: { label:'Blessings', tag:'Blessing', words:[
    ['אֲשֶׁר קִדְּשָׁנוּ','asher kid\'shanu','who has sanctified us'],
    ['בְּמִצְוֺתָיו','b\'mitzvotav','by His commandments'],
    ['וְצִוָּנוּ','v\'tzivanu','and commanded us'],
    ['לְהַדְלִיק נֵר שֶׁל שַׁבָּת','l\'hadlik ner shel Shabbat','to kindle the Sabbath light'],
    ['בּוֹרֵא פְּרִי הַגָּפֶן','bore p\'ri hagafen','who creates the fruit of the vine'],
    ['הַמּוֹצִיא לֶחֶם מִן הָאָרֶץ','hamotzi lechem min ha\'aretz','who brings forth bread from the earth'],
    ['שֶׁהֶחֱיָנוּ','shehecheyanu','who has given us life'],
    ['וְקִיְּמָנוּ','v\'kiy\'manu','and sustained us'],
    ['וְהִגִּיעָנוּ','v\'higi\'anu','and brought us'],
    ['לַזְּמַן הַזֶּה','laz\'man haze','to this season'],
    ['אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֺתָיו','asher kid\'shanu b\'mitzvotav','who made us holy by His commandments'],
    ['וְרָצָה בָנוּ','v\'ratza vanu','and favored us'],
    ['וְשַׁבַּת קָדְשׁוֹ בְּאַהֲבָה וּבְרָצוֹן הִנְחִילָנוּ','v\'Shabbat kodsho b\'ahava uv\'ratzon hinchilanu','and gave us as an inheritance His holy Sabbath in love and in favor'],
    ['זִכָּרוֹן לְמַעֲשֵׂה בְרֵאשִׁית','zikaron l\'ma\'ase v\'reshit','a reminder of the works of Creation'],
    ['כִּי הוּא יוֹם תְּחִלָּה לְמִקְרָאֵי קֹדֶשׁ','ki hu yom t\'chila l\'mikra\'ei kodesh','For it is a first day among the festivals of holiness'],
    ['זֵכֶר לִיצִיאַת מִצְרָיִם','zecher litzi\'at Mitzrayim','a reminder of the Exodus from Egypt'],
    ['כִּי בָנוּ בָחַרְתָּ','ki vanu vacharta','For You have chosen us'],
    ['וְאוֹתָנוּ קִדַּשְׁתָּ מִכָּל הָעַמִּים','v\'otanu kidashta mikol ha\'amim','and have made us holy among all the peoples'],
    ['וְשַׁבַּת קָדְשְׁךָ בְּאַהֲבָה וּבְרָצוֹן הִנְחַלְתָּנוּ','v\'Shabbat kodsh\'cha b\'ahava uv\'ratzon hinchaltanu','and have given us as an inheritance Your holy Sabbath in love and in favor'],
    ['מְקַדֵּשׁ הַשַּׁבָּת','m\'kadesh haShabbat','who makes the Sabbath holy']
  ]},

  verses: { label:'Verses & Songs', tag:'Verse', words:[
    ['וְאָהַבְתָּ לְרֵעֲךָ כָּמוֹךָ','v\'ahavta l\'re\'acha kamocha','Love your neighbor as yourself.'],
    ['אֵין חָדָשׁ תַּחַת הַשֶּׁמֶשׁ','ein chadash tachat hashemesh','There is nothing new under the sun. (proverb)'],
    ['הִנֵּה מַה טּוֹב וּמַה נָּעִים שֶׁבֶת אַחִים גַּם יָחַד','Hine ma tov umah na\'im shevet achim gam yachad','Behold how good and how pleasant it is for brothers to dwell together as one. (Psalm 133)'],
    ['לֹא יִשָּׂא גוֹי אֶל גּוֹי חֶרֶב לֹא יִלְמְדוּ עוֹד מִלְחָמָה','Lo yisa goy el goy cherev, lo yilm\'du od milchama','Nation shall not lift up sword against nation. They shall not learn war anymore. (Isaiah 2:4)'],
    ['מַה טֹּבוּ אֹהָלֶיךָ יַעֲקֹב מִשְׁכְּנֹתֶיךָ יִשְׂרָאֵל','Ma tovu ohalecha Ya\'akov, mishk\'notecha Yisra\'el','How goodly are your tents, Jacob, your tabernacles, Israel. (Numbers 24:5)']
  ]}
};

/* ---------------- reference decks ---------------- */
const L = (g,name,sound,note) => ({front:g, size:'xl', name, translit:sound, note});

const REF_DECKS = {
  letters: { label:'Alef-Bet', tag:'Letter', cards:[
    L('א','אָלֶף','Alef','Silent. A placeholder — it takes whatever vowel sits under it.'),
    L('בּ','בֵּית','Bet — "b"','The dot inside (dagesh) hardens it to "b".'),
    L('ב','בֵית','Vet — "v"','Same letter, no dot: softens to "v".'),
    L('ג','גִימֶל','Gimel — "g"','Always hard "g", as in "go".'),
    L('ד','דָלֶת','Dalet — "d"','Note the sharp top-right corner.'),
    L('ה','הֵא','Hey — "h"','Often silent at the end of a word.'),
    L('ו','וָו','Vav — "v"','Also carries the "o" and "oo" vowels.'),
    L('ז','זַיִן','Zayin — "z"','A crowned vertical stroke.'),
    L('ח','חֵית','Chet — "ch"','Guttural, from the throat.'),
    L('ט','טֵית','Tet — "t"','Same sound as tav.'),
    L('י','יוֹד','Yod — "y"','The smallest letter; floats at the top of the line.'),
    L('כּ','כַּף','Kaf — "k"','With the dot: hard "k".'),
    L('כ','כַף','Khaf — "kh"','Without the dot: throaty "kh", like chet.'),
    L('ך','כַף סוֹפִית','Final Khaf','End of word only; the leg drops below the line.'),
    L('ל','לָמֶד','Lamed — "l"','The tallest letter; rises above the line.'),
    L('מ','מֵם','Mem — "m"','Closed on top, small opening at the bottom left.'),
    L('ם','מֵם סוֹפִית','Final Mem','Fully closed square. End of word only.'),
    L('נ','נוּן','Nun — "n"','Narrower than gimel, with a flat foot.'),
    L('ן','נוּן סוֹפִית','Final Nun','A straight stroke dropping below the line.'),
    L('ס','סָמֶךְ','Samech — "s"','Closed and rounded.'),
    L('ע','עַיִן','Ayin','Silent in most modern pronunciation — like alef.'),
    L('פּ','פֵּא','Pe — "p"','With the dot: "p".'),
    L('פ','פֵא','Fe — "f"','Without the dot: "f".'),
    L('ף','פֵא סוֹפִית','Final Fe','End of word only; descends below the line.'),
    L('צ','צָדִי','Tzadi — "ts"','As in "cats". The book calls it TSAHDEE.'),
    L('ץ','צָדִי סוֹפִית','Final Tzadi','End of word only.'),
    L('ק','קוֹף','Kuf — "k"','Same sound as kaf with a dot.'),
    L('ר','רֵישׁ','Resh — "r"','Rounded top-right corner — unlike dalet.'),
    L('שׁ','שִׁין','Shin — "sh"','Dot on the RIGHT arm.'),
    L('שׂ','שִׂין','Sin — "s"','Dot on the LEFT arm.'),
    L('תּ','תָּו','Tav — "t"','Final letter of the alef-bet.')
  ]},

  vowels: { label:'Vowels', tag:'Nikkud', cards:[
    L('אַ','פַּתַח','Patach — "ah"','A single horizontal line under the letter.'),
    L('אָ','קָמַץ','Kamatz — "ah"','A line with a small tail hanging down.'),
    L('אֶ','סֶגּוֹל','Segol — "eh"','Three dots in a downward triangle.'),
    L('אֵ','צֵירֵי','Tzere — "ay"','Two dots side by side.'),
    L('אִ','חִירִיק','Chirik — "ee"','A single dot underneath.'),
    L('אִי','חִירִיק מָלֵא','Chirik malei — "ee"','Chirik followed by a yod.'),
    L('אֹ','חוֹלָם','Cholam — "oh"','A single dot on the upper LEFT of the letter.'),
    L('אוֹ','חוֹלָם מָלֵא','Cholam malei — "oh"','A vav with a dot on top.'),
    L('אֻ','קֻבּוּץ','Kubutz — "oo"','Three dots on a rising diagonal.'),
    L('אוּ','שׁוּרוּק','Shuruk — "oo"','A vav with a dot in its middle.'),
    L('אְ','שְׁוָא','Shva','Two vertical dots. A very short "uh", or silent.'),
    L('אֲ','חֲטַף פַּתַח','Chataf patach — short "ah"','Shva plus patach. Mainly under gutturals.'),
    L('אֱ','חֲטַף סֶגּוֹל','Chataf segol — short "eh"','Shva plus segol.'),
    L('אֳ','חֲטַף קָמַץ','Chataf kamatz — short "oh"','Shva plus kamatz.'),
    L('אָי','קָמַץ + יוֹד','"ai"','Kamatz followed by yod gives AH-EE — as in Adonai.'),
    L('אַי','פַּתַח + יוֹד','"ai"','Patach followed by yod gives AH-EE — as in Shaddai.')
  ]},

  lookalikes: { label:'Look-Alikes', tag:'Compare', cards:[
    {front:'ב כ', size:'pair', name:'Bet / Khaf', translit:'b · kh', note:'Bet has a square bottom-right corner and a small foot sticking out to the right. Khaf is rounded with no foot.'},
    {front:'ד ר', size:'pair', name:'Dalet / Resh', translit:'d · r', note:'Dalet has a sharp corner with a nub top-right. Resh is smoothly curved.'},
    {front:'ה ח', size:'pair', name:'Hey / Chet', translit:'h · ch', note:'Hey has a gap in the top-left. Chet is closed all the way across.'},
    {front:'ו ז', size:'pair', name:'Vav / Zayin', translit:'v · z', note:'Vav\'s head sits to the left of the stem. Zayin\'s head is centered, like a crown.'},
    {front:'ג נ', size:'pair', name:'Gimel / Nun', translit:'g · n', note:'Gimel has a leg kicking out to the left. Nun\'s foot points right only.'},
    {front:'ם ס', size:'pair', name:'Final Mem / Samech', translit:'m · s', note:'Final mem is square. Samech is round.'},
    {front:'ע צ', size:'pair', name:'Ayin / Tzadi', translit:'silent · ts', note:'Ayin\'s left arm joins the stem low, forming a V. Tzadi\'s arm joins higher and bends.'},
    {front:'ך ן', size:'pair', name:'Final Khaf / Final Nun', translit:'kh · n', note:'Final khaf has a horizontal roof before dropping. Final nun is a plain vertical stroke.'},
    {front:'שׁ שׂ', size:'pair', name:'Shin / Sin', translit:'sh · s', note:'Only the dot differs. Right dot = shin ("sh"). Left dot = sin ("s").'},
    {front:'תּ ט', size:'pair', name:'Tav / Tet', translit:'t · t', note:'Identical sound, different shape. Tav has a foot on the left leg; tet is a closed pot.'},
    {front:'ק ף', size:'pair', name:'Kuf / Final Fe', translit:'k · f', note:'Both drop below the line. Kuf\'s leg hangs from a separate roof; final fe curls inward.'}
  ]}
};

/* ---------------- build decks ---------------- */
function sizeFor(s){
  const n = s.replace(/[֑-ׇ]/g,'').length;
  if(n <= 4)  return 'xl';
  if(n <= 9)  return 'lg';
  if(n <= 20) return 'md';
  return 'sm';
}

const PHRASE_DECKS = ['prayers','blessings','verses'];
const DECKS = {};
let ALL = [];
Object.entries(VOCAB).forEach(([key,d])=>{
  const cards = d.words.map(([h,t,m])=>({front:h, size:sizeFor(h), translit:t, mean:m, vocab:true}));
  DECKS[key] = {label:d.label, tag:d.tag, vocab:true, cards};
  if(!PHRASE_DECKS.includes(key)) ALL = ALL.concat(cards);
});
DECKS.all = {label:'All Words', tag:'Vocabulary', vocab:true, cards:ALL};
Object.assign(DECKS, REF_DECKS);

const TOTAL_LABEL = ALL.length + ' words + ' + PHRASE_DECKS.reduce((n,k)=>n+VOCAB[k].words.length,0) + ' prayers & verses';

function speakTextFor(c, deck){
  if(!c) return '';
  // Only the Alef-Bet deck needs the letter's name spoken instead of its
  // glyph — a bare consonant (e.g. ר alone) has no vowel to cue correct
  // pronunciation. Vowels/Nikkud cards are a letter+vowel-point combo
  // (e.g. אַ) that already sounds right read as-is; speaking the nikud's
  // *name* there would say "Patach" instead of the "ah" sound it wants.
  if(deck && deck.tag === 'Letter' && c.name && /[א-ת]/.test(c.name)) return c.name;
  return c.front;
}

function isHebrewText(s){
  return !!s && /[א-ת]/.test(s);
}

const DAGESH = 'ּ';
// Letters where the U+05BC combining mark is meaningful and must be kept:
// bet/kaf/pe, where dagesh audibly changes the sound (b/v, k/kh, p/f) in
// Modern Israeli Hebrew — and vav, where the *same* codepoint doubles as
// the "shuruk" vowel sign (וּ = "oo"), not a dagesh at all. On every other
// letter it's a silent grammatical mark (dagesh qal) that TTS engines
// apparently mistake for a gemination/glottal cue, inserting a spurious
// extra syllable (e.g. גַּן "gan" coming out "ga-e-an").
const DAGESH_AUDIBLE_LETTERS = new Set(['ב', 'כ', 'פ', 'ו']); // ב כ פ ו

// Prepares display text for speech only — never used for what's shown
// on the card, only for what's sent to the TTS proxy.
function normalizeForSpeech(text){
  if(!text) return text;
  let result = text
    // יְיָ is the traditional written substitute for the divine name —
    // always read aloud as "Adonai" regardless of how it's spelled. No
    // TTS engine can infer that liturgical convention on its own.
    .replace(/יְיָ/g, 'אֲדֹנָי');

  // Match each Hebrew consonant plus its whole trailing run of combining
  // marks (nikkud, dagesh, shin/sin dot) as one cluster — the source data
  // isn't consistent about whether dagesh comes immediately after the
  // letter or after the vowel point, so a simple one-char lookbehind for
  // dagesh isn't reliable; scanning the whole cluster is.
  result = result.replace(
    /([א-ת])([֑-ׇ]*)/gu,
    (match, letter, marks) => {
      if (!marks.includes(DAGESH)) return match;
      if (DAGESH_AUDIBLE_LETTERS.has(letter)) return match;
      return letter + marks.replace(DAGESH, '');
    }
  );

  return result;
}

/* ============================ THEME ============================ */
const COLORS = {
  ink: '#0B1729',
  ink2: '#132340',
  rule: '#22375A',
  paper: '#F2F5F9',
  paperEdge: '#D7DFEA',
  accent: '#2E6BE6',
  accentSoft: '#8FB4F7',
  copper: '#C77B3C',
  muted: '#8298B5',
};

const HEB_FONT = Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' });

// Cloudflare Worker proxying Google Cloud TTS (web only) — see worker/src/index.js.
// Native platforms keep using the device's TextToSpeech engine via expo-speech.
const TTS_PROXY_URL = 'https://hebrew-flashcards-tts.azaurov.workers.dev';
// The Worker's response has a 1-year immutable Cache-Control, which caches
// per exact URL in the *browser's own* HTTP cache — separate from and in
// addition to Cloudflare's edge cache. Swapping TTS providers/voices server-
// side does nothing for a returning visitor's browser cache, since the
// request URL never changed. Bump this whenever the backend voice/provider
// changes so the URL itself changes and old cached audio can't be reused.
// Switched from Google Cloud TTS to Azure Cognitive Services: all 10 of
// Google's he-IL voices produced the same mispronunciation of a common
// word regardless of voice or text-pointing formulation tested, and
// Google Translate's own product (same underlying tech) reproduced it
// too -- a confirmed limitation of Google's Hebrew TTS, not our Worker.
const TTS_CACHE_BUST = 'v4-azure';

// Mirrors the original CSS clamp(min, vw%, max) rules so glyphs scale with
// screen width the same way the WebView version did.
function clampSize(min, vwPercent, max, width){
  return Math.min(max, Math.max(min, (width * vwPercent) / 100));
}

const GLYPH_CLAMPS = {
  xl:   [70, 21,  126],
  lg:   [44, 13,  78],
  md:   [30, 8.5, 50],
  sm:   [21, 5.6, 34],
  pair: [52, 16,  92],
};

/* ============================ APP ============================ */
// Fixed fallback matched on both the static server render and the first
// client render, so hydration never disagrees; the real size is applied
// via effect immediately after mount (client-only, avoids React error #418).
const FALLBACK_DIMS = { width: 390, height: 844 };

export default function App() {
  const deckKeys = useMemo(() => Object.keys(DECKS), []);
  const [{ width, height }, setDims] = useState(FALLBACK_DIMS);

  useEffect(() => {
    setDims(Dimensions.get('window'));
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);

  const [deckKey, setDeckKey] = useState(deckKeys[0]);
  const [queue, setQueue] = useState(() => DECKS[deckKeys[0]].cards.slice());
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [reverse, setReverse] = useState(false);
  const [done, setDone] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [hebrewVoice, setHebrewVoice] = useState(null);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const heb = voices.filter((v) => v.language && v.language.toLowerCase().startsWith('he'));
        const best =
          heb.find((v) => v.identifier.includes('hed-network')) ||
          heb.find((v) => v.identifier.includes('hed-local')) ||
          heb.find((v) => v.identifier.includes('hed')) ||
          heb[0];
        setHebrewVoice(best?.identifier || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Without this, audio playback via expo-audio is silenced whenever the
    // iOS hardware mute switch is on — a common "no sound" surprise.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: flipped ? 1 : 0,
      duration: 500,
      easing: Easing.bezier(0.4, 0.15, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [flipped, flipAnim]);

  const deck = DECKS[deckKey];
  const card = queue[idx];
  const rev = reverse && deck.vocab;

  // Browser/OS voices vary wildly (some devices only expose one Hebrew
  // voice, and it can mispronounce letters like resh) — used only as a
  // fallback if the TTS proxy is unreachable (e.g. offline).
  function speakWithBrowserVoice(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const match = hebrewVoice ? voices.find((v) => v.voiceURI === hebrewVoice) : null;
    utterance.voice = match || null;
    utterance.lang = match ? match.lang : 'he-IL';
    utterance.rate = 0.85;
    setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function speak(text) {
    if (!text) return;
    // Only affects what's sent to the TTS proxy — the displayed card text
    // is untouched.
    const ttsText = normalizeForSpeech(text);

    if (Platform.OS === 'web') {
      setSpeaking(true);
      setDone('');

      // Safari (notably iOS) generally requires audio.play() to happen
      // synchronously inside the user-gesture call stack — a play() called
      // later, after an async fetch resolves, can get silently blocked.
      // Priming an <audio> element with play() right here, before the
      // fetch even starts, keeps it "unlocked" for the real playback once
      // its src is set below. Chrome/Android didn't surface this because
      // it's more lenient about deferred gesture-linked playback.
      const audio = new window.Audio();
      try {
        const primePromise = audio.play();
        if (primePromise && primePromise.catch) primePromise.catch(() => {});
      } catch {
        // Playing with no source throws synchronously in some browsers —
        // fine, the element is still primed for the src swap below.
      }

      fetch(`${TTS_PROXY_URL}/?text=${encodeURIComponent(ttsText)}&v=${TTS_CACHE_BUST}`)
        .then((res) => {
          if (!res.ok) throw new Error(`TTS proxy error ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          audio.src = url;
          audio.onended = () => {
            setSpeaking(false);
            window.URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setSpeaking(false);
            window.URL.revokeObjectURL(url);
          };
          const playPromise = audio.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(() => {
              setSpeaking(false);
              setDone('Using device voice (playback blocked).');
              speakWithBrowserVoice(text);
            });
          }
        })
        .catch(() => {
          setSpeaking(false);
          setDone('Using device voice (audio service unreachable).');
          speakWithBrowserVoice(text);
        });
      return;
    }

    // Native: prefer the same Azure-TTS-backed proxy used on web, since
    // on-device voices vary wildly in Hebrew pronunciation quality across
    // manufacturers/OS versions (see the Android "hed" voice hunt, which
    // doesn't even transfer to iOS — Apple's voice identifiers use a
    // completely different naming scheme). Fall back to the device voice
    // only if the proxy is unreachable.
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.remove();
      } catch {
        // already released
      }
      audioPlayerRef.current = null;
    }
    setSpeaking(true);
    setDone('');

    const uri = `${TTS_PROXY_URL}/?text=${encodeURIComponent(ttsText)}&v=${TTS_CACHE_BUST}`;
    const player = createAudioPlayer(uri);
    audioPlayerRef.current = player;
    let settled = false;

    const cleanUp = () => {
      if (audioPlayerRef.current === player) audioPlayerRef.current = null;
      try {
        player.remove();
      } catch {
        // already released
      }
    };

    // expo-audio has no dedicated load-error event to react to; if
    // playback hasn't started within a few seconds (bad network, proxy
    // down), assume it failed and fall back rather than leaving the user
    // with silence.
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.remove();
      cleanUp();
      setDone('Using device voice (audio service unreachable).');
      speakWithDeviceVoice(text);
    }, 4000);

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (settled) return;
      if (status.didJustFinish) {
        settled = true;
        clearTimeout(fallbackTimer);
        subscription.remove();
        cleanUp();
        setSpeaking(false);
      }
    });

    player.play();
  }

  function speakWithDeviceVoice(text) {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: 'he-IL',
      voice: hebrewVoice || undefined,
      rate: 0.85,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  // Keyboard shortcuts only make sense on web (desktop browser).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKeyDown(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === '1') mark(false);
      else if (e.key === '2') mark(true);
      else if (e.key.toLowerCase() === 'p') speak(speakTextFor(queue[idx], deck));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, idx, hebrewVoice, deck]);

  function loadDeck(key) {
    setDeckKey(key);
    setQueue(DECKS[key].cards.slice());
    setIdx(0);
    setFlipped(false);
    setReviewCount(0);
    setDone('');
  }

  function shuffle() {
    const next = queue.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setQueue(next);
    setIdx(0);
    setFlipped(false);
    setDone('Shuffled.');
  }

  function step(n) {
    setIdx((prevIdx) => {
      const t = prevIdx + n;
      if (t < 0 || t >= queue.length) {
        if (t >= queue.length) {
          setDone(
            reviewCount
              ? `End of deck — ${reviewCount} card${reviewCount > 1 ? 's' : ''} re-queued for review.`
              : 'End of deck. Shuffle to run it again.'
          );
        }
        return prevIdx;
      }
      setFlipped(false);
      setDone('');
      return t;
    });
  }

  function mark(knew) {
    if (!knew) {
      setQueue((q) => [...q, q[idx]]);
      setReviewCount((c) => c + 1);
    }
    if (idx === queue.length - 1) {
      setDone('End of deck. Shuffle to run it again.');
      setFlipped(false);
      return;
    }
    step(1);
  }

  if (!card) return null;

  const cardWrapMaxHeight = height < 640 ? 290 : 420;
  const showKeys = height >= 640;

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const glyphFontSize = (() => {
    const key = card.size || 'xl';
    const [min, vw, max] = GLYPH_CLAMPS[key] || GLYPH_CLAMPS.xl;
    return clampSize(min, vw, max, width);
  })();
  const nameFontSize = clampSize(24, 6.4, 34, width);
  const translitFontSize = clampSize(17, 4.6, 23, width);
  const meanFontSize = clampSize(15, 4, 19, width);
  const promptFontSize = clampSize(22, 6, 32, width);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.ink} />

      <View style={styles.header}>
        <Text style={styles.title}>HEBREW READING FLASHCARDS</Text>
        <Text style={styles.sub}>
          The New Reading Hebrew · <Text style={styles.subBold}>{TOTAL_LABEL}</Text>
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.decksRow}
        >
          {deckKeys.map((key) => {
            const d = DECKS[key];
            const selected = key === deckKey;
            const isHeb = /[א-ת]/.test(d.label) && d.label.length < 14;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => loadDeck(key)}
                style={[styles.deckPill, selected && styles.deckPillSelected]}
              >
                <Text
                  style={[
                    styles.deckLabel,
                    isHeb && styles.deckLabelHeb,
                    selected && styles.deckLabelSelected,
                  ]}
                >
                  {d.label}
                </Text>
                <Text style={[styles.deckCount, selected && styles.deckCountSelected]}>
                  {' '}{d.cards.length}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.rail}>
        {deck.vocab ? (
          <TouchableOpacity
            style={styles.dirBtn}
            onPress={() => {
              setReverse((r) => !r);
              setFlipped(false);
            }}
          >
            <Text style={styles.dirText}>{rev ? 'EN → עב' : 'עב → EN'}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${((idx + 1) / queue.length) * 100}%` }]} />
        </View>
        <Text style={styles.count}>{idx + 1} / {queue.length}</Text>
      </View>

      <View style={styles.stage}>
        <View style={[styles.cardWrap, { maxHeight: cardWrapMaxHeight }]}>
          {isHebrewText(card.front) ? (
            <TouchableOpacity
              style={[styles.speakBtn, speaking && styles.speakBtnActive]}
              onPress={() => speak(speakTextFor(card, deck))}
            >
              <Text style={styles.speakIcon}>🔊</Text>
            </TouchableOpacity>
          ) : null}

          <Pressable style={styles.cardTouchable} onPress={() => setFlipped((f) => !f)}>
            <Animated.View
              style={[
                styles.face,
                styles.faceFront,
                { transform: [{ perspective: 1400 }, { rotateY: frontRotate }] },
              ]}
            >
              <Text style={styles.tagFront}>{deck.tag}</Text>
              {rev ? (
                <Text style={[styles.prompt, { fontSize: promptFontSize }]}>{card.mean}</Text>
              ) : card.size === 'pair' ? (
                <View style={styles.pairRow}>
                  {card.front.split(' ').map((g, i) => (
                    <Text key={i} style={[styles.glyph, { fontSize: glyphFontSize }]}>{g}</Text>
                  ))}
                </View>
              ) : (
                <Text style={[styles.glyph, { fontSize: glyphFontSize }]}>{card.front}</Text>
              )}
              <Text style={styles.hint}>Tap to reveal</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.face,
                styles.faceBack,
                { transform: [{ perspective: 1400 }, { rotateY: backRotate }] },
              ]}
            >
              <Text style={styles.tagBack}>Answer</Text>
              {rev ? (
                <>
                  <Text style={[styles.glyph, styles.glyphBack, { fontSize: glyphFontSize }]}>
                    {card.front}
                  </Text>
                  <Text style={[styles.translit, { fontSize: translitFontSize }]}>{card.translit}</Text>
                </>
              ) : (
                <>
                  {card.name ? (
                    <Text style={[styles.name, { fontSize: nameFontSize }]}>{card.name}</Text>
                  ) : null}
                  {card.translit ? (
                    <Text style={[styles.translit, { fontSize: translitFontSize }]}>{card.translit}</Text>
                  ) : null}
                  {card.mean ? (
                    <Text style={[styles.mean, { fontSize: meanFontSize }]}>{card.mean}</Text>
                  ) : null}
                  {card.note ? <Text style={styles.note}>{card.note}</Text> : null}
                </>
              )}
            </Animated.View>
          </Pressable>
        </View>
      </View>

      <View style={styles.controls}>
        <Text style={styles.done}>{done}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.actBtn} onPress={() => mark(false)}>
            <Text style={styles.actText}>Review again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actPrimary]} onPress={() => mark(true)}>
            <Text style={[styles.actText, styles.actTextPrimary]}>Knew it</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actBtn, styles.actGhost]}
            disabled={idx === 0}
            onPress={() => step(-1)}
          >
            <Text style={[styles.actText, styles.actTextGhost, idx === 0 && styles.actTextDisabled]}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={() => setFlipped((f) => !f)}>
            <Text style={styles.actText}>Flip card</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actGhost]} onPress={shuffle}>
            <Text style={[styles.actText, styles.actTextGhost]}>Shuffle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, styles.actGhost]} onPress={() => step(1)}>
            <Text style={[styles.actText, styles.actTextGhost]}>→</Text>
          </TouchableOpacity>
        </View>
        {showKeys ? (
          <Text style={styles.keys}>
            {Platform.OS === 'web'
              ? 'Space flips · Arrows move · P plays audio · 1 review, 2 knew it'
              : 'Tap card to flip · Tap 🔊 to hear pronunciation'}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.ink, padding: 14, gap: 12 },
  header: {},
  title: { fontSize: 13, letterSpacing: 2, color: COLORS.muted, fontWeight: '600' },
  sub: { fontSize: 12, color: COLORS.rule, marginTop: 2 },
  subBold: { color: COLORS.muted, fontWeight: '600' },
  decksRow: { gap: 6, marginTop: 12, paddingBottom: 2 },
  deckPill: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckPillSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  deckLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.muted },
  deckLabelHeb: { fontFamily: HEB_FONT, fontSize: 15, writingDirection: 'rtl' },
  deckLabelSelected: { color: '#fff' },
  deckCount: { fontSize: 11, fontWeight: '500', color: COLORS.muted, opacity: 0.6 },
  deckCountSelected: { color: '#fff', opacity: 0.8 },

  rail: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dirBtn: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  dirText: { fontSize: 11, fontWeight: '600', color: COLORS.muted, letterSpacing: 0.5 },
  track: { flex: 1, height: 3, backgroundColor: COLORS.rule, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.accent },
  count: { fontSize: 11.5, color: COLORS.muted, letterSpacing: 0.5 },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 460,
    height: '100%',
    minHeight: 230,
  },
  cardTouchable: { flex: 1 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  faceFront: { backgroundColor: COLORS.paper, borderBottomWidth: 3, borderBottomColor: COLORS.paperEdge },
  faceBack: {
    backgroundColor: COLORS.ink2,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.accent,
  },
  tagFront: { position: 'absolute', top: 12, right: 14, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: '#93A5BA' },
  tagBack: { position: 'absolute', top: 12, right: 14, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', color: COLORS.copper },
  glyph: { fontFamily: HEB_FONT, color: COLORS.ink, textAlign: 'center', writingDirection: 'rtl' },
  glyphBack: { color: '#fff' },
  pairRow: { flexDirection: 'row', gap: 14 },
  hint: { marginTop: 18, fontSize: 11.5, color: '#8494A8', letterSpacing: 0.5 },
  name: { fontFamily: HEB_FONT, fontWeight: '500', color: '#fff', writingDirection: 'rtl' },
  translit: { fontWeight: '600', color: COLORS.accentSoft, marginTop: 6, textAlign: 'center' },
  mean: { color: COLORS.paper, marginTop: 12, lineHeight: 24, textAlign: 'center', maxWidth: '90%' },
  note: { fontSize: 13, color: COLORS.muted, marginTop: 14, lineHeight: 19, textAlign: 'center', maxWidth: '90%' },
  prompt: { fontWeight: '600', color: COLORS.ink, lineHeight: 34, textAlign: 'center' },

  speakBtn: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.ink2,
    borderWidth: 1,
    borderColor: COLORS.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakBtnActive: { borderColor: COLORS.accent },
  speakIcon: { fontSize: 16 },

  controls: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  actBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.rule,
    backgroundColor: COLORS.ink2,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  actPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  actGhost: { flex: 0, backgroundColor: 'transparent', paddingHorizontal: 16 },
  actText: { fontSize: 13.5, fontWeight: '600', color: COLORS.paper },
  actTextPrimary: { color: '#fff' },
  actTextGhost: { color: COLORS.muted },
  actTextDisabled: { opacity: 0.35 },
  done: { fontSize: 12.5, color: COLORS.copper, textAlign: 'center', minHeight: 16 },
  keys: { fontSize: 11, color: COLORS.rule, textAlign: 'center', letterSpacing: 0.5 },
});
