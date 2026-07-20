import { useEffect, useMemo, useRef, useState } from 'react';
import { COLD_ANGER_PROMPT } from './prompts';
import { Archive, ArrowLeftRight, Check, ChevronDown, Clipboard, Clock3, Copy, Download, Edit3, FileImage, Heart, ImagePlus, Menu, MessageSquareText, Moon, MoreHorizontal, Plus, RotateCcw, Search, Settings2, Sparkles, Star, Sun, Trash2, Upload, WandSparkles, X, Zap } from 'lucide-react';

type Template = {id:string;name:string;description:string;icon:string;accent:string;prompt:string;category:string;favorite?:boolean;thumbnail?:string;uses:number;updated:number};
type HistoryItem = {id:string;prompt:string;template:string;at:number};
type ImageSlot = {data:string;name:string}|null;
type Toast = {text:string;kind?:'ok'|'info'}|null;

const BUILTIN_GLOW_REFERENCE:ImageSlot={data:import.meta.env.BASE_URL+'presets/glow-eye-reference.png',name:'光彩・瞳テイスト参考.png'};

const STARTERS: Template[] = [
  {id:'thumb',name:'文字なしサムネ',description:'大胆な構図で、画面いっぱいに',icon:'✦',accent:'#ff6b45',category:'サムネイル',uses:0,updated:1,prompt:'1枚目の画像をベースに、ダイナミックで画面全体を大胆に使ったサムネイル画像を作ってください。元画像とは異なる構図にしてください。{intensity}\n{characterKeep}\n{styleReference}\n{ratio}\n{noText}'},
  {id:'comic',name:'1コマ漫画',description:'セリフと集中線で強い一場面に',icon:'！',accent:'#b8f23f',category:'漫画',uses:0,updated:2,prompt:'1枚目のキャラクターを使って1コマ漫画を作ってください。セリフは「{dialogue}」。{framing}で描き、{expression}の表情にしてください。{effects}\n{styleReference}\n{ratio}\n{comicText}'},
  {id:'style',name:'標準テイスト変換',description:'色・質感・空気感をバランスよく反映',icon:'◐',accent:'#9b8cff',category:'テイスト変換',uses:0,updated:3,prompt:'1枚目の画像を変更元として使用し、被写体と主要な特徴を維持してください。2枚目の画像からは{styleParts}を参考にし、{styleStrength}反映してください。2枚目の人物、文字、具体的な物体はコピーしないでください。\n{composition}\n{ratio}\n{noText}'},
  {id:'style-glow',name:'光彩・瞳サムネ',description:'美しい光と瞳、濃い色彩のダイナミック構図',icon:'◇',accent:'#ff78c8',category:'テイスト変換',thumbnail:import.meta.env.BASE_URL+'presets/glow-eye-reference.png',uses:0,updated:4,prompt:'1枚目の画像を変更対象として使用してください。1枚目のキャラクターや被写体の固有特徴、顔立ち、髪型、衣装などは維持し、別人化させないでください。\n\n2枚目の画像はテイストの参考として使用してください。特に、{styleParts}を{styleStrength}取り入れてください。2枚目の人物、衣装、ポーズ、構図、文字、具体的な物体はコピーしないでください。\n\n描画は輪郭線をしっかりと見せ、色は濃く鮮やかにしてください。光の反射、輝き、透明感を画面全体に豊かに取り入れてください。\n{thumbnail}\n{composition}\n{custom}\n{ratio}\n{noText}'},  {id:'recompose',name:'構図を変える',description:'内容を保ったまま新しい画角へ',icon:'↗',accent:'#45c7ff',category:'構図',uses:0,updated:4,prompt:'1枚目の画像のキャラクター、衣装、重要な特徴を維持しながら、{compositionLevel}。{framing}を中心に、元画像とは明確に異なるカメラ位置と画面構成にしてください。{intensity}\n{styleReference}\n{ratio}\n{noText}'},
  {id:'closeup',name:'顔アップ・強調',description:'表情を主役にしたインパクト',icon:'◎',accent:'#ffcf4a',category:'構図',uses:0,updated:5,prompt:'1枚目のキャラクターの顔を大きくクローズアップし、{expression}の表情を強調してください。顔を画面の主役にしたインパクトのある構図。{effects}\n{styleReference}\n{ratio}\n{noText}'},
  {id:'cold-anger',name:'冷たい怒りの一言',description:'見下す表情と強いセリフ演出',icon:'怒',accent:'#ff4f46',category:'セリフ・漫画',uses:0,updated:6,prompt:COLD_ANGER_PROMPT},
  {id:'free',name:'自由テンプレート',description:'追加指示からすばやく作成',icon:'＋',accent:'#ef6fd0',category:'自由',uses:0,updated:6,prompt:'1枚目の画像を参考に、次の指示に従って画像を作ってください。\n{custom}\n{styleReference}\n{ratio}\n{noText}'}
];

const TEXT_IMPACT:Record<string,string>={
  '淡々とした小さな文字':'文字は小さめで控えめにし、過剰に装飾せず、冷たく刺さる配置にしてください。',
  '静かな圧のある文字':'文字は落ち着いた大きさとし、静かで逃げ場のない重さと威圧感を持たせ、余白を活かして冷たく刺さる配置にしてください。',
  'やや強め':'文字は通常よりやや大きく太くし、セリフの強さが一目で伝わるメリハリを持たせてください。',
  '迫力ある太字':'文字は強い存在感のある太字にし、一撃の重さが伝わる力強い配置にしてください。',
  '角張ったクソデカ太文字':'文字は画面の余白を大胆に使った非常に大きく角張った太文字にし、単色で最大限の威圧感を持たせてください。顔を隠さない範囲で画面を圧迫するほどの存在感を出してください。'
};

const read = <T,>(key:string, fallback:T):T => {try{return JSON.parse(localStorage.getItem(key)||'') as T}catch{return fallback}};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const compressImage=(file:File)=>new Promise<string>((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/webp',.84))};img.onerror=reject;img.src=url});
const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
const makeHandoffImage=async(first:ImageSlot,second:ImageSlot)=>{if(!first||!second)throw new Error('images required');const [a,b]=await Promise.all([loadImage(first.data),loadImage(second.data)]);const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1280;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#101116';ctx.fillRect(0,0,canvas.width,canvas.height);const draw=(img:HTMLImageElement,x:number,label:string)=>{const w=870,h=1160,y=90;const scale=Math.min(w/img.width,h/img.height);const dw=img.width*scale,dh=img.height*scale;ctx.fillStyle='#181a21';ctx.fillRect(x,y,w,h);ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.fillStyle='rgba(10,11,15,.88)';ctx.fillRect(x+18,y+18,300,52);ctx.fillStyle='#fff';ctx.font='700 24px sans-serif';ctx.fillText(label,x+38,y+52)};draw(a,20,'1 変更したい画像');draw(b,910,'2 テイスト参考画像');return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('image export failed')),'image/png'))};

function ImageDrop({slot,label,subtitle,value,onChange}: {slot:number;label:string;subtitle:string;value:ImageSlot;onChange:(v:ImageSlot)=>void}){
  const input=useRef<HTMLInputElement>(null); const load=async(file?:File)=>{if(file?.type.startsWith('image/'))onChange({data:await compressImage(file),name:file.name})};
  return <div className={`image-drop ${value?'has-image':''}`} onClick={()=>!value&&input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();load(e.dataTransfer.files[0])}}>
    <input ref={input} hidden type="file" accept="image/*" onChange={e=>load(e.target.files?.[0])}/>
    {value?<><img src={value.data} alt={label}/><div className="image-overlay"><span>{value.name}</span><button onClick={e=>{e.stopPropagation();input.current?.click()}} aria-label="画像を変更"><Edit3 size={15}/></button><button onClick={e=>{e.stopPropagation();onChange(null)}} aria-label="画像を削除"><X size={16}/></button></div></>:<div className="drop-empty"><div className="slot-number">{slot}</div><ImagePlus size={25}/><strong>{label}</strong><span>{subtitle}</span><small>クリック、ドロップ、または貼り付け</small></div>}
  </div>
}

const CHOICE_MARKS:Record<string,string>={'16:9':'▭','1:1':'□','9:16':'▯','4:3':'▰','3:4':'▥','顔アップ':'◎','上半身':'◉','全身':'○','ローアングル':'↗','俯瞰':'↘','斜め構図':'◇','驚き':'!','怒り':'#','笑顔':'☺','真剣':'—','コミカル':'☆','泣き':'…','最優先':'★','標準':'●','自然に調整':'○','無表情・ジト目':'—','冷たい怒り':'◆','呆れ・失望':'…','強く睨む':'▲','上半身＋顔アップ':'◉','顔のクローズアップ':'◎','一段下から見上げる':'↗','正面から見る':'→','斜め下から見上げる':'⤴','白背景':'□','黒背景':'■','単色背景':'▣','簡素な背景':'▤'};
function ChoiceTiles({value,options,onChange,compact=false,color=false}:{value:string;options:string[];onChange:(value:string)=>void;compact?:boolean;color?:boolean}){
  const tones:Record<string,string>={黒:'#111318',白:'#fff',赤:'#e24842',濃紺:'#172744'};
  return <div className={`choice-tiles ${compact?'compact':''}`} role="radiogroup">{options.map(option=><button type="button" role="radio" aria-checked={value===option} key={option} className={value===option?'selected':''} onClick={()=>onChange(option)}>{color?<i className="color-dot" style={{background:tones[option]}}/>:<i>{CHOICE_MARKS[option]||'•'}</i>}<span>{option}</span>{value===option&&<Check size={13}/>}</button>)}</div>
}

export function App(){
  const [templates,setTemplates]=useState<Template[]>(()=>read('pp-templates',STARTERS));
  const [activeId,setActiveId]=useState(()=>{const saved=read<string>('pp-active','thumb');return saved==='style'?'thumb':saved});
  const [mode,setMode]=useState<'prompt'|'style'>('prompt');
  const [source,setSource]=useState<ImageSlot>(null),[style,setStyle]=useState<ImageSlot>(null);
  const [dialogue,setDialogue]=useState('！'),[custom,setCustom]=useState('');
  const [textMode,setTextMode]=useState<'none'|'dialogue'|'allow'>('none');
  const [ratio,setRatio]=useState('9:16'),[framing,setFraming]=useState('顔アップ'),[expression,setExpression]=useState('驚き');
  const [intensity,setIntensity]=useState(2),[styleStrength,setStyleStrength]=useState(3);
  const [styleRecompose,setStyleRecompose]=useState(true),[thumbnailMode,setThumbnailMode]=useState(true);
  const [effects,setEffects]=useState<string[]>(['集中線','激しい演出']);
  const [styleParts,setStyleParts]=useState<string[]>(['光の美しさ','瞳のテイスト','色彩','線画']);
  const [keep,setKeep]=useState<string[]>(['キャラクター','衣装','顔の特徴']);
  const [textImpact,setTextImpact]=useState('静かな圧のある文字');
  const [coldExpression,setColdExpression]=useState('無表情・ジト目');
  const [coldFraming,setColdFraming]=useState('上半身＋顔アップ');
  const [coldView,setColdView]=useState('一段下から見上げる');
  const [coldBackground,setColdBackground]=useState('白背景');
  const [textColor,setTextColor]=useState('黒');
  const [textPlacement,setTextPlacement]=useState('自動');
  const [characterFidelity,setCharacterFidelity]=useState('最優先');
  const [history,setHistory]=useState<HistoryItem[]>(()=>read('pp-history',[]));
  const [dark,setDark]=useState(()=>read('pp-dark',true));
  const [search,setSearch]=useState(''),[category,setCategory]=useState('すべて');
  const [libraryOpen,setLibraryOpen]=useState(false),[editor,setEditor]=useState<Template|null>(null),[historyOpen,setHistoryOpen]=useState(false),[detailOpen,setDetailOpen]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(min-width: 781px)').matches);
  const [toast,setToast]=useState<Toast>(null);
  const active=templates.find(t=>t.id===activeId)||templates[0];

  useEffect(()=>{setTemplates(current=>{const glow=STARTERS.find(s=>s.id==='style-glow')!;const migrated=current.map(t=>t.id==='style-glow'&&t.prompt.includes('{referenceUrl}')?{...t,prompt:glow.prompt,thumbnail:glow.thumbnail}:t);const missing=STARTERS.filter(s=>!migrated.some(t=>t.id===s.id));return missing.length?[...migrated,...missing]:migrated})},[]);
  useEffect(()=>{localStorage.setItem('pp-templates',JSON.stringify(templates))},[templates]);
  useEffect(()=>{localStorage.setItem('pp-history',JSON.stringify(history.slice(0,50)))},[history]);
  useEffect(()=>{localStorage.setItem('pp-dark',JSON.stringify(dark));document.documentElement.dataset.theme=dark?'dark':'light'},[dark]);
  useEffect(()=>localStorage.setItem('pp-active',JSON.stringify(activeId)),[activeId]);
  useEffect(()=>{const paste=(e:ClipboardEvent)=>{const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(file)compressImage(file).then(data=>!source?setSource({data,name:'貼り付けた画像'}):setStyle({data,name:'貼り付けた画像'}))};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste)},[source]);
  useEffect(()=>{const keys=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();copyPrompt()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setLibraryOpen(true)}};window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys)});
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),2200);return()=>clearTimeout(t)},[toast]);

  const replacements:Record<string,string>={
    dialogue:dialogue||'（セリフ未入力）',custom:custom||'自由な発想で魅力的に仕上げてください。',framing,expression,
    textImpact,textImpactInstruction:TEXT_IMPACT[textImpact],
    characterFidelity:characterFidelity==='最優先'?'キャラクターの再現を最優先し、別人化を厳しく避けてください。':characterFidelity==='標準'?'キャラクターの固有特徴を明確に維持してください。':'主要な特徴を維持しつつ自然に調整してください。',
    coldExpression:`${coldExpression}を基本とし、こちらに対する興味を失ったような淡々とした目つきと、見下している空気を表現してください。`,
    coldComposition:`${coldFraming}。視点は${coldView}構図とし、キャラクターがユーザーを見下ろしている感覚を強く伝えてください。`,
    coldBackground:`${coldBackground}にしてください。`,coldTypography:`文字色は${textColor}の単色で統一し、配置は${textPlacement}。グラデーション、虹色、多色使いは避け、顔に被りすぎない読みやすい配置にしてください。`,
    effects:effects.length?`${effects.join('と')}を使った、勢いのある演出にしてください。`:'自然な演出にしてください。',
    ratio:`画像比率は${ratio}。`,noText:textMode==='none'?'文字、字幕、ロゴ、透かし、吹き出しを入れないでください。':textMode==='allow'?'必要に応じて読みやすい文字を配置してください。':'指定したセリフ以外の文字、字幕、ロゴ、透かしを入れないでください。',
    comicText:textMode==='none'?'セリフは吹き出しを使わず、キャラクターの発話内容として表現してください。':textMode==='dialogue'?'セリフだけを読みやすい吹き出しに入れ、ほかの文字は入れないでください。':'セリフを読みやすい吹き出しに入れてください。',
    intensity:['落ち着きのある自然な演出にしてください。','視線を引くメリハリのある演出にしてください。','強い遠近感と躍動感のある、非常にダイナミックな演出にしてください。'][intensity-1],
    styleStrength:['控えめに','明確に','全体へ強く'][styleStrength-1],styleParts:styleParts.join('、'),
    styleReference:style?`2枚目の画像からは${styleParts.join('、')}だけを参考にし、被写体や構図はコピーしないでください。`: '',
    characterKeep:`1枚目の${keep.join('、')}を維持してください。`,composition:styleRecompose?'1枚目の被写体を保ちながら、元画像と同じ構図を再現せず、カメラ位置、ポーズ、被写体の配置を大胆に組み直してください。':'1枚目の構図を基本的に維持してください。',thumbnail:thumbnailMode?'画面全体を大胆に使った、視線を引きつけるダイナミックなサムネイルにしてください。':'自然な一枚絵として仕上げてください。',compositionLevel:'構図とカメラ位置を大胆に変更してください'
  };
  const prompt=useMemo(()=>{let value=active.prompt;Object.entries(replacements).forEach(([k,v])=>value=value.replaceAll(`{${k}}`,v));return value.replace(/\n{2,}/g,'\n').trim()},[active,replacements]);
  const categories=['すべて',...Array.from(new Set(templates.map(t=>t.category)))];
  const filtered=templates.filter(t=>(category==='すべて'||t.category===category)&&(`${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.uses-a.uses);
  const toggle=(value:string,list:string[],set:(v:string[])=>void)=>set(list.includes(value)?list.filter(x=>x!==value):[...list,value]);
  const choose=(t:Template)=>{const isStyle=t.id==='style'||t.category==='テイスト変換';setMode(isStyle?'style':'prompt');setActiveId(t.id);if(t.id==='style-glow'){setStyleParts(['光の美しさ','瞳のテイスト','色彩','線画']);setStyleStrength(3);setTextMode('none');setStyleRecompose(true);setThumbnailMode(true);setStyle(BUILTIN_GLOW_REFERENCE)}if(t.id==='comic'){setTextMode('dialogue');if(!dialogue)setDialogue('！')}if(t.id==='cold-anger'&&dialogue==='！')setDialogue('');setLibraryOpen(false)};
  async function copyPrompt(){if(mode==='style'&&(!source||!style)){setToast({text:'変更元画像とテイスト参考画像を追加してください'});return}if(active.id==='cold-anger'&&!source){setToast({text:'参考画像を追加してください'});return}if(active.id==='cold-anger'&&!dialogue.trim()){setToast({text:'セリフ本文を入力してください'});return}await navigator.clipboard.writeText(prompt);setTemplates(v=>v.map(x=>x.id===active.id?{...x,uses:x.uses+1,updated:Date.now()}:x));setHistory(v=>[{id:uid(),prompt,template:active.name,at:Date.now()},...v].slice(0,50));setToast({text:'プロンプトをコピーしました',kind:'ok'})}
  const prepareForChatGPT=async()=>{if(!source||!style){setToast({text:'画像1と画像2を揃えてください'});return}const handoffPrompt=`添付する送信用画像は左右2分割です。左側の「1 変更したい画像」を変更対象、右側の「2 テイスト参考画像」をテイスト参考として扱ってください。\n\n${prompt}`;try{const blob=await makeHandoffImage(source,style);const file=new File([blob],'prompt-palette-2images.png',{type:'image/png'});const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);if(isMobile&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'Prompt Palette',text:handoffPrompt,files:[file]});setToast({text:'画像とプロンプトを共有しました',kind:'ok'});return}await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);window.open(`https://chatgpt.com/?q=${encodeURIComponent(handoffPrompt)}`,'_blank','noopener,noreferrer');setToast({text:'送信用画像をコピーしました。ChatGPTで貼り付けてください',kind:'ok'})}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;const blob=await makeHandoffImage(source,style);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='prompt-palette-2images.png';a.click();URL.revokeObjectURL(url);await navigator.clipboard.writeText(handoffPrompt);window.open('https://chatgpt.com/','_blank','noopener,noreferrer');setToast({text:'画像を保存し、プロンプトをコピーしました',kind:'ok'})}};
  const swap=()=>{const a=source;setSource(style);setStyle(a)};
  const reset=()=>{setDialogue(active.id==='cold-anger'?'':'！');setTextImpact('静かな圧のある文字');setColdExpression('無表情・ジト目');setColdFraming('上半身＋顔アップ');setColdView('一段下から見上げる');setColdBackground('白背景');setTextColor('黒');setTextPlacement('自動');setCharacterFidelity('最優先');setCustom('');setTextMode(active.id==='comic'?'dialogue':'none');setRatio('9:16');setFraming('顔アップ');setExpression('驚き');setIntensity(2);setStyleStrength(mode==='style'?3:2);setStyleRecompose(true);setThumbnailMode(true);setStyleParts(mode==='style'?['光の美しさ','瞳のテイスト','色彩','線画']:['色使い','線や塗りの質感','ライティング','全体の雰囲気']);setEffects(['集中線','激しい演出']);setToast({text:'設定を初期化しました'})};
  const exportData=()=>{const blob=new Blob([JSON.stringify({version:1,templates,history},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`prompt-palette-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);setToast({text:'ライブラリを書き出しました',kind:'ok'})};
  const importData=(file?:File)=>{if(!file)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(String(r.result));if(Array.isArray(d.templates))setTemplates(d.templates);if(Array.isArray(d.history))setHistory(d.history);setToast({text:'ライブラリを復元しました',kind:'ok'})}catch{setToast({text:'読み込めないファイルです'})}};r.readAsText(file)};

  return <div className="app-shell">
    <header><div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><div><b>Prompt Palette</b><span>VISUAL PROMPT WORKSPACE</span></div></div><div className="header-actions"><button className="shortcut" onClick={()=>setLibraryOpen(true)}><Search size={16}/>テンプレートを検索 <kbd>Ctrl K</kbd></button><button className="icon-btn" onClick={()=>setHistoryOpen(true)} aria-label="履歴"><Clock3 size={18}/></button><button className="icon-btn" onClick={()=>setDark(!dark)} aria-label="テーマ切替">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="avatar">A</button></div></header>
    <main>
      <section className="hero-row"><div><div className="eyebrow"><Zap size={13}/> PROMPT COMPOSER</div><h1>イメージを選んで、<br/><em>ことばを仕立てる。</em></h1><p>いつものプロンプトを、必要な部分だけ変えてすばやく完成。</p></div><div className="hero-stat"><span>現在のテンプレート</span><strong>{templates.length}</strong><small>すべて端末に保存されています</small></div></section>

      <div className="mode-switch" role="tablist" aria-label="作成モード">
        <button role="tab" aria-selected={mode==='prompt'} className={mode==='prompt'?'active':''} onClick={()=>{setMode('prompt');if(active.id==='style'||active.category==='テイスト変換')setActiveId('thumb')}}><WandSparkles size={17}/><span><b>プロンプトを当てる</b><small>いつもの見本と定型文から作成</small></span></button>
        <button role="tab" aria-selected={mode==='style'} className={mode==='style'?'active':''} onClick={()=>{setMode('style');setActiveId('style-glow');setStyleParts(['光の美しさ','瞳のテイスト','色彩','線画']);setStyleStrength(3);setTextMode('none');setStyleRecompose(true);setThumbnailMode(true);setStyle(BUILTIN_GLOW_REFERENCE)}}><ArrowLeftRight size={17}/><span><b>2枚でテイスト変換</b><small>別画像の色・質感を参考にする</small></span></button>
      </div>

      <section className="workspace-grid">
        <div className="left-column">
          <div className="section-head"><div><span className="step">01</span><h2>{mode==='prompt'?'プロンプトを適用する画像':'変更元とテイスト参考'}</h2></div><div className="head-actions">{mode==='style'&&<button onClick={swap} disabled={!source&&!style}><ArrowLeftRight size={15}/>入れ替え</button>}<button onClick={()=>{setSource(null);if(mode==='style')setStyle(null)}} disabled={!source&&!style}><Trash2 size={15}/>クリア</button></div></div>
          {mode==='prompt'?<div className="single-image"><ImageDrop slot={1} label="画像を入れる" subtitle="この画像に選んだプロンプトを適用します" value={source} onChange={setSource}/><div className="single-image-guide"><FileImage size={21}/><div><b>まず、変更したい画像を1枚</b><span>次に下の見本画像付きテンプレートを選びます</span></div></div></div>:<><div className="image-pair"><ImageDrop slot={1} label="変更したい画像" subtitle="被写体・内容のベース" value={source} onChange={setSource}/><ImageDrop slot={2} label="テイスト参考" subtitle="色・質感・空気感" value={style} onChange={setStyle}/></div>{active.id==='style-glow'&&<div className="reference-handoff"><div><b>参考画像を内蔵しています</b><span>ChatGPTでは画像1とこの参考画像の2枚を添付して、完成プロンプトを貼り付けます。</span></div><a href={BUILTIN_GLOW_REFERENCE!.data} download="光彩・瞳テイスト参考.png"><Download size={15}/>参考画像を保存</a></div>}</>}

          <div className="output-format-bar"><div className="output-format-copy"><span>OUTPUT FORMAT</span><b>生成画像の比率</b></div><ChoiceTiles compact value={ratio} options={['9:16','16:9','1:1','4:3','3:4']} onChange={setRatio}/></div>

          {mode==='style'&&<><div className="section-head templates-title"><div><span className="step">02</span><h2>テイスト変換プリセットを選ぶ</h2></div><button className="text-btn" onClick={()=>setEditor({id:'',name:'新しいテイスト変換',description:'',icon:'◐',accent:'#9b8cff',prompt:'1枚目を変更元、2枚目をテイスト参考として使用してください。\n{styleReference}\n{composition}\n{thumbnail}\n{custom}\n{ratio}\n{noText}',category:'テイスト変換',uses:0,updated:Date.now()})}><Plus size={14}/>新規追加</button></div><div className="template-strip style-presets">{templates.filter(t=>t.id==='style'||t.category==='テイスト変換').slice().sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updated-a.updated).map(t=><button key={t.id} className={`template-card ${activeId===t.id?'active':''}`} style={{'--accent':t.accent} as React.CSSProperties} onClick={()=>choose(t)}><span className="template-icon">{t.thumbnail?<img src={t.thumbnail}/>:t.icon}</span><span><b>{t.name}</b><small>{t.description}</small></span>{activeId===t.id&&<i><Check size={12}/></i>}</button>)}</div></>}

          {mode==='prompt'&&<><div className="section-head templates-title"><div><span className="step">02</span><h2>見本からプロンプトを選ぶ</h2></div><button className="text-btn" onClick={()=>setLibraryOpen(true)}>ライブラリを開く <ChevronDown size={15}/></button></div>
          <div className="template-strip main-templates">{templates.filter(t=>t.id!=='style').slice().sort((a,b)=>Number(b.favorite)-Number(a.favorite)).slice(0,6).map(t=><button key={t.id} className={`template-card ${activeId===t.id?'active':''}`} style={{'--accent':t.accent} as React.CSSProperties} onClick={()=>choose(t)}><span className="template-icon">{t.thumbnail?<img src={t.thumbnail}/>:t.icon}</span><span><b>{t.name}</b><small>{t.description}</small></span>{activeId===t.id&&<i><Check size={12}/></i>}</button>)}</div></>}

          <div className="section-head options-title"><div><span className="step">03</span><h2>{mode==='prompt'?'必要なところだけ調整':'選んだプリセットを調整'}</h2></div><button className="text-btn" onClick={reset}><RotateCcw size={14}/>リセット</button></div>
          <div className={`controls-card ${active.id==='cold-anger'?'cold-controls':''}`}>
            {active.id==='cold-anger'&&<>
              <label className="field wide"><span>セリフ本文・必須</span><div className="quote-input"><MessageSquareText size={17}/><span>「</span><input value={dialogue} onChange={e=>setDialogue(e.target.value)} placeholder="決定打になる一言を入力"/><span>」</span></div></label>
              <div className="field wide"><span>テキストの迫力</span><div className="impact-options">{Object.keys(TEXT_IMPACT).map(x=><button key={x} className={textImpact===x?'selected':''} onClick={()=>setTextImpact(x)}>{x}</button>)}</div></div>
              <button className="details-toggle" onClick={()=>setDetailOpen(!detailOpen)}><Settings2 size={15}/>表情・構図・文字を詳細変更<ChevronDown size={15} className={detailOpen?'rotated':''}/></button>
              {detailOpen&&<div className="details-panel cold-details">
                <div className="field wide"><span>キャラクター再現</span><ChoiceTiles compact value={characterFidelity} options={['自然に調整','標準','最優先']} onChange={setCharacterFidelity}/></div>
                <div className="field wide"><span>表情・目つき</span><ChoiceTiles value={coldExpression} options={['無表情・ジト目','冷たい怒り','呆れ・失望','強く睨む']} onChange={setColdExpression}/></div>
                <div className="field wide"><span>描写範囲</span><ChoiceTiles value={coldFraming} options={['顔のクローズアップ','上半身＋顔アップ','上半身','全身']} onChange={setColdFraming}/></div>
                <div className="field wide"><span>視点</span><ChoiceTiles value={coldView} options={['一段下から見上げる','正面から見る','斜め下から見上げる']} onChange={setColdView}/></div>
                <div className="field wide"><span>背景</span><ChoiceTiles value={coldBackground} options={['白背景','黒背景','単色背景','簡素な背景']} onChange={setColdBackground}/></div>
                <div className="field wide"><span>文字色</span><ChoiceTiles compact color value={textColor} options={['黒','白','赤','濃紺']} onChange={setTextColor}/></div>
                <label className="field wide"><span>文字の配置</span><div className="segmented"><button className={textPlacement==='自動'?'selected':''} onClick={()=>setTextPlacement('自動')}>自動</button><button className={textPlacement==='上部'?'selected':''} onClick={()=>setTextPlacement('上部')}>上部</button><button className={textPlacement==='左右'?'selected':''} onClick={()=>setTextPlacement('左右')}>左右</button><button className={textPlacement==='顔の横'?'selected':''} onClick={()=>setTextPlacement('顔の横')}>顔の横</button></div></label>
              </div>}
            </>}
            {active.id!=='cold-anger'&&<>
            {mode==='style'&&<>
              <div className="field wide"><span>2枚目から重点的に取り入れる要素</span><div className="chips style-part-chips">{['光の美しさ','瞳のテイスト','色彩','線画','塗りの質感','全体の雰囲気'].map(x=><button key={x} className={styleParts.includes(x)?'on':''} onClick={()=>toggle(x,styleParts,setStyleParts)}>{styleParts.includes(x)&&<Check size={12}/>} {x}</button>)}</div></div>
              <div className="field wide"><span>テイストの反映強度</span><div className="segmented"><button className={styleStrength===1?'selected':''} onClick={()=>setStyleStrength(1)}>控えめ</button><button className={styleStrength===2?'selected':''} onClick={()=>setStyleStrength(2)}>しっかり</button><button className={styleStrength===3?'selected':''} onClick={()=>setStyleStrength(3)}>ふんだんに</button></div></div>
              <div className="field wide"><span>仕上がり</span><div className="style-switches"><button className={textMode==='none'?'on':''} onClick={()=>setTextMode(textMode==='none'?'allow':'none')}><Check size={14}/>文字なし</button><button className={styleRecompose?'on':''} onClick={()=>setStyleRecompose(!styleRecompose)}><Check size={14}/>構図を変える</button><button className={thumbnailMode?'on':''} onClick={()=>setThumbnailMode(!thumbnailMode)}><Check size={14}/>サムネイル向け</button></div></div>
              <label className="field wide"><span>このプリセットへの追加指示・任意</span><textarea value={custom} onChange={e=>setCustom(e.target.value)} placeholder="例：背景は夜、表情は真剣に など"/></label>
              <button className="details-toggle" onClick={()=>setDetailOpen(!detailOpen)}><Settings2 size={15}/>維持する要素を詳細変更<ChevronDown size={15} className={detailOpen?'rotated':''}/></button>
              {detailOpen&&<div className="details-panel"><div className="field wide"><span>1枚目から維持する要素</span><div className="checks">{['キャラクター','衣装','顔の特徴','ポーズ','背景','構図'].map(x=><label key={x}><input type="checkbox" checked={keep.includes(x)} onChange={()=>toggle(x,keep,setKeep)}/><i>{keep.includes(x)&&<Check size={12}/>}</i>{x}</label>)}</div></div></div>}
            </>}
            {mode==='prompt'&&<>{active.id==='comic'&&<label className="field wide"><span>セリフ</span><div className="quote-input"><MessageSquareText size={17}/><span>「</span><input value={dialogue} onChange={e=>setDialogue(e.target.value)} placeholder="セリフを入力"/><span>」</span></div></label>}
            {active.id==='free'&&<label className="field wide"><span>追加したい指示</span><textarea value={custom} onChange={e=>setCustom(e.target.value)} placeholder="作りたい画像を自由に入力してください"/></label>}
            <div className="field"><span>文字</span><div className="segmented"><button className={textMode==='none'?'selected':''} onClick={()=>setTextMode('none')}>なし</button><button className={textMode==='dialogue'?'selected':''} onClick={()=>setTextMode('dialogue')}>セリフのみ</button><button className={textMode==='allow'?'selected':''} onClick={()=>setTextMode('allow')}>あり</button></div></div>

            <div className="field wide"><span>画角</span><ChoiceTiles value={framing} options={['顔アップ','上半身','全身','ローアングル','俯瞰','斜め構図']} onChange={setFraming}/></div>
            <div className="field wide"><span>表情</span><ChoiceTiles value={expression} options={['驚き','怒り','笑顔','真剣','コミカル','泣き']} onChange={setExpression}/></div>
            <div className="field wide"><span>クイック追加</span><div className="chips">{['集中線','激しい演出','スピード線','強い遠近感','コミカル','映画的な光'].map(x=><button key={x} className={effects.includes(x)?'on':''} onClick={()=>toggle(x,effects,setEffects)}>{effects.includes(x)&&<Check size={12}/>} {x}</button>)}</div></div>
            <button className="details-toggle" onClick={()=>setDetailOpen(!detailOpen)}><Settings2 size={15}/>詳細設定<ChevronDown size={15} className={detailOpen?'rotated':''}/></button>
            {detailOpen&&<div className="details-panel">
              <div className="field"><span>演出の強さ</span><input type="range" min="1" max="3" value={intensity} onChange={e=>setIntensity(+e.target.value)}/><div className="range-labels"><small>控えめ</small><small>標準</small><small>強い</small></div></div>
              <div className="field"><span>テイストの強さ</span><input type="range" min="1" max="3" value={styleStrength} onChange={e=>setStyleStrength(+e.target.value)}/><div className="range-labels"><small>控えめ</small><small>標準</small><small>強い</small></div></div>
              <div className="field wide"><span>2枚目から参考にする要素</span><div className="checks">{['色使い','線や塗りの質感','ライティング','全体の雰囲気','構図','背景'].map(x=><label key={x}><input type="checkbox" checked={styleParts.includes(x)} onChange={()=>toggle(x,styleParts,setStyleParts)}/><i>{styleParts.includes(x)&&<Check size={12}/>}</i>{x}</label>)}</div></div>
              <div className="field wide"><span>1枚目から維持する要素</span><div className="checks">{['キャラクター','衣装','顔の特徴','ポーズ','背景','構図'].map(x=><label key={x}><input type="checkbox" checked={keep.includes(x)} onChange={()=>toggle(x,keep,setKeep)}/><i>{keep.includes(x)&&<Check size={12}/>}</i>{x}</label>)}</div></div>
            </div>}</>}
            </>}
          </div>
        </div>

        <aside className="prompt-panel"><div className="prompt-panel-head"><div><WandSparkles size={18}/><span>完成プロンプト</span></div><span className="live"><i/> LIVE</span></div><div className="selected-template"><span style={{background:active.accent}}>{active.icon}</span><div><small>SELECTED TEMPLATE</small><strong>{active.name}</strong></div><button onClick={()=>setEditor(active)}><MoreHorizontal size={18}/></button></div><div className="prompt-text"><textarea value={prompt} readOnly/><div className="count">{prompt.length}文字</div></div>{mode==='style'&&<div className="requirements"><span className={source?'' :'missing'}>{source?<Check size={13}/>:<ImagePlus size={13}/>}変更元画像</span><span className={style?'' :'missing'}>{style?<Check size={13}/>:<ImagePlus size={13}/>}テイスト参考</span></div>}{active.id==='cold-anger'&&<div className="requirements"><span className={source?'' :'missing'}>{source?<Check size={13}/>:<ImagePlus size={13}/>}参考画像</span><span className={dialogue.trim()?'' :'missing'}>{dialogue.trim()?<Check size={13}/>:<MessageSquareText size={13}/>}セリフ本文</span></div>}<button className="copy-primary" onClick={copyPrompt}><Copy size={18}/>プロンプトをコピー <kbd>Ctrl ↵</kbd></button>{mode==='style'&&<><button className="chatgpt-handoff" onClick={prepareForChatGPT}><ImagePlus size={17}/>2枚をまとめてChatGPTへ</button><p className="chatgpt-hint">PCは開いたChatGPTで貼り付け。スマホは共有先にChatGPTを選びます。</p></>}<div className="mini-actions"><button onClick={()=>setEditor({...active,id:'',name:`${active.name}のコピー`})}><Archive size={15}/>派生を保存</button><button onClick={()=>setHistoryOpen(true)}><Clock3 size={15}/>履歴を見る</button></div><div className="privacy-note"><span>●</span><div><b>端末内で処理しています</b><small>画像と入力内容は外部に送信されません</small></div></div></aside>
      </section>
    </main>
    <nav className="mobile-nav"><button className="active"><WandSparkles/>作成</button><button onClick={()=>setLibraryOpen(true)}><Star/>テンプレート</button><button onClick={()=>setHistoryOpen(true)}><Clock3/>履歴</button><button onClick={()=>setDark(!dark)}><Settings2/>設定</button></nav>

    {libraryOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setLibraryOpen(false)}><div className="modal library-modal"><div className="modal-head"><div><small>YOUR COLLECTION</small><h2>テンプレートライブラリ</h2></div><button className="icon-btn" onClick={()=>setLibraryOpen(false)}><X/></button></div><div className="library-tools"><div className="searchbox"><Search/><input autoFocus placeholder="テンプレートを検索" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="new-btn" onClick={()=>setEditor({id:'',name:'新しいテンプレート',description:'',icon:'✦',accent:'#ff6b45',prompt:'{custom}\n{ratio}\n{noText}',category:'カスタム',uses:0,updated:Date.now()})}><Plus/>新規作成</button></div><div className="category-tabs">{categories.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="library-grid">{filtered.map(t=><div className={`library-card ${activeId===t.id?'active':''}`} key={t.id} onClick={()=>choose(t)}><div className="library-art" style={{'--accent':t.accent} as React.CSSProperties}>{t.thumbnail?<img src={t.thumbnail}/>:<span>{t.icon}</span>}<button className={`heart ${t.favorite?'on':''}`} onClick={e=>{e.stopPropagation();setTemplates(v=>v.map(x=>x.id===t.id?{...x,favorite:!x.favorite}:x))}}><Heart size={16} fill={t.favorite?'currentColor':'none'}/></button></div><div className="library-copy"><small>{t.category}</small><b>{t.name}</b><p>{t.description}</p><div><span>{t.uses}回使用</span><button onClick={e=>{e.stopPropagation();setEditor(t)}}><Edit3 size={14}/>編集</button></div></div></div>)}</div><div className="library-footer"><label><Upload size={15}/>バックアップを復元<input hidden type="file" accept="application/json" onChange={e=>importData(e.target.files?.[0])}/></label><button onClick={exportData}><Download size={15}/>書き出す</button></div></div></div>}

    {editor&&<TemplateEditor template={editor} onClose={()=>setEditor(null)} onSave={t=>{const saved={...t,id:t.id||uid(),updated:Date.now()};setTemplates(v=>t.id?v.map(x=>x.id===t.id?saved:x):[saved,...v]);setActiveId(saved.id);setEditor(null);setToast({text:'テンプレートを保存しました',kind:'ok'})}} onDelete={editor.id&&!STARTERS.some(x=>x.id===editor.id)?()=>{setTemplates(v=>v.filter(x=>x.id!==editor.id));setEditor(null)}:undefined}/>} 
    {historyOpen&&<div className="drawer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setHistoryOpen(false)}><aside className="history-drawer"><div className="modal-head"><div><small>RECENT PROMPTS</small><h2>生成履歴</h2></div><button className="icon-btn" onClick={()=>setHistoryOpen(false)}><X/></button></div>{history.length===0?<div className="empty-history"><Clock3/><b>まだ履歴はありません</b><span>コピーしたプロンプトがここに残ります</span></div>:<div className="history-list">{history.map(h=><div key={h.id}><div><b>{h.template}</b><time>{new Date(h.at).toLocaleString('ja-JP')}</time></div><p>{h.prompt}</p><button onClick={()=>navigator.clipboard.writeText(h.prompt)}><Clipboard size={14}/>コピー</button></div>)}</div>} {history.length>0&&<button className="clear-history" onClick={()=>setHistory([])}><Trash2 size={15}/>履歴を消去</button>}</aside></div>}
    {toast&&<div className={`toast ${toast.kind||''}`}><Check size={16}/>{toast.text}</div>}
  </div>
}

function TemplateEditor({template,onClose,onSave,onDelete}:{template:Template;onClose:()=>void;onSave:(t:Template)=>void;onDelete?:()=>void}){
  const [v,setV]=useState(template);const image=useRef<HTMLInputElement>(null);const change=(key:keyof Template,value:string)=>setV(x=>({...x,[key]:value}));
  return <div className="modal-backdrop top" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal editor-modal"><div className="modal-head"><div><small>TEMPLATE EDITOR</small><h2>{template.id?'テンプレートを編集':'新しいテンプレート'}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="editor-layout"><button className="cover-picker" style={{'--accent':v.accent} as React.CSSProperties} onClick={()=>image.current?.click()}>{v.thumbnail?<img src={v.thumbnail}/>:<><span>{v.icon}</span><small>見本画像を追加</small></>}<input ref={image} hidden type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(f){const thumbnail=await compressImage(f);setV(x=>({...x,thumbnail}))}}}/></button><div className="editor-fields"><label><span>名前</span><input value={v.name} onChange={e=>change('name',e.target.value)}/></label><label><span>説明</span><input value={v.description} onChange={e=>change('description',e.target.value)}/></label><div className="split"><label><span>カテゴリ</span><input value={v.category} onChange={e=>change('category',e.target.value)}/></label><label><span>アクセント</span><input type="color" value={v.accent} onChange={e=>change('accent',e.target.value)}/></label></div></div></div><label className="prompt-editor"><span>プロンプト本文</span><textarea value={v.prompt} onChange={e=>change('prompt',e.target.value)}/><small>利用可能：{'{dialogue} {custom} {ratio} {noText} {styleReference} {styleParts} {styleStrength} {composition} {thumbnail} {framing} {expression} {effects}'}</small></label><div className="editor-actions">{onDelete&&<button className="danger" onClick={onDelete}><Trash2/>削除</button>}<span/><button onClick={onClose}>キャンセル</button><button className="save" disabled={!v.name.trim()||!v.prompt.trim()} onClick={()=>onSave(v)}><Check/>保存する</button></div></div></div>
}
