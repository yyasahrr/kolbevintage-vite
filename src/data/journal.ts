import hero from "@/assets/editorial/hero.jpg";
import atelier from "@/assets/editorial/atelier.jpg";
import campaign from "@/assets/editorial/campaign.jpg";
import look2 from "@/assets/models/look-2.webp";
import look5 from "@/assets/models/look-5.webp";
import look6 from "@/assets/models/look-6.webp";
import look1 from "@/assets/models/look-1.webp";

export interface ArticleBlock {
  type: "p" | "h" | "quote" | "image" | "gallery";
  text: string;
  /** image blocks: one picture + its caption */
  src?: string;
  /** gallery blocks: two or more pictures */
  images?: string[];
}

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  category: "آتلیه" | "استایل" | "رانوی" | "پارچه";
  date: string;
  readTime: number;
  image: string;
  imageTone: string;
  /** transparent runway cut-out → frame with contain; photograph → cover */
  cutout?: boolean;
  featured?: boolean;
  blocks: ArticleBlock[];
}

export const POSTS: Post[] = [
  {
    slug: "poetry-of-the-long-coat",
    title: "شعرِ پالتوی بلند",
    excerpt:
      "چرا یک پالتوی بلند بیش از یک لباس است: دربارهٔ نسبت حجم، سکوت رنگ و فرمی که با راه رفتن کامل می‌شود.",
    category: "استایل",
    date: "۲۴ مهر ۱۴۰۵",
    readTime: 6,
    image: look1,
    imageTone: "#e9e0d4",
    cutout: true,
    featured: true,
    blocks: [
      { type: "p", text: "پالتوی بلند اولین چیزی است که از دور دیده می‌شود و آخرین چیزی که در ذهن می‌ماند. نسبت آن با بدن، شانه و قدم، تعیین می‌کند که آیا یک لایهٔ ساده به یک سیلوئت تبدیل می‌شود یا نه." },
      { type: "h", text: "نسبت، نه اندازه" },
      { type: "p", text: "در آتلیه، پیش از انتخاب اندازه، نسبت‌ها را می‌سنجیم: خط شانه، محل بستن دکمه و نقطه‌ای که پارچه رها می‌شود. پالتوی ریو با شانهٔ افتاده و برش بلند طراحی شده است تا وقتی راه می‌روی، پارچه یک قدم عقب بماند." },
      { type: "quote", text: "یک لایهٔ خوب، بدن را می‌پوشاند؛ یک لایهٔ درست، حرکت را آزاد می‌کند." },
      { type: "p", text: "برای لایه‌بندی، زیر پالتو یک بافت نازک با یقهٔ بلند انتخاب کن و شلوار را راسته و کوتاه نگه دار. رنگ‌های خنثی فضا می‌دهند و کیف کوچک، مجموعه را جمع می‌کند." },
    ],
  },
  {
    slug: "inside-the-atelier",
    title: "درون آتلیه: سه هفته برای یک یقه",
    excerpt:
      "سفری کوتاه به میز کار ما؛ جایی که یک یقه پیش از رسیدن به رانوی، سه هفته و یازده تغییر را تجربه می‌کند.",
    category: "آتلیه",
    date: "۹ مهر ۱۴۰۵",
    readTime: 8,
    image: atelier,
    imageTone: "#e7dcc9",
    blocks: [
      { type: "p", text: "میز اول آتلیه همیشه پوشیده از کاغذ است. الگوها روی کاغذ کشمیر کشیده می‌شوند، با مداد نرم و خطوطی که چند بار پاک و دوباره کشیده شده‌اند." },
      { type: "h", text: "از نخ به فرم" },
      { type: "p", text: "برای هر قطعه، سه نمونهٔ پارچه با وزن‌های متفاوت آزمایش می‌شود. آنچه در رانوی می‌بینی، نتیجهٔ انتخاب دقیق همین سه انتخاب است: پارچه‌ای که می‌ایستد، پارچه‌ای که می‌افتد و پارچه‌ای که نفس می‌کشد." },
      { type: "quote", text: "ما لباس نمی‌سازیم؛ تصمیم می‌گیریم پارچه کجای بدن بایستد." },
      { type: "p", text: "دوخت پایانی همیشه دستی است: سجاف‌ها، جا دکمه‌ها و لبه‌های آستین. این جزئیات از فاصلهٔ یک متر دیده نمی‌شوند، اما همان چیزی هستند که لباس را از یک محصول به یک قطعهٔ پوشیدنی تبدیل می‌کند." },
    ],
  },
  {
    slug: "night-satin-notes",
    title: "یادداشت‌های ساتن شب",
    excerpt:
      "از ارگانزا تا ساتن اریب؛ راهنمای انتخاب قطعه‌های شب که در نور کم هم درست دیده می‌شوند.",
    category: "پارچه",
    date: "۲۸ شهریور ۱۴۰۵",
    readTime: 5,
    image: look5,
    imageTone: "#dcd8e0",
    cutout: true,
    blocks: [
      { type: "p", text: "شب، نور را کم می‌کند و بافت را برجسته. بنابراین در انتخاب لباس شب، اولویت با بافتی است که در نور ضعیف هم عمق داشته باشد." },
      { type: "p", text: "ساتن اریب، وزن خود را روی بدن توزیع می‌کند؛ به همین دلیل در حرکت، خطوط نرم و پیوسته می‌سازد. اگر لایهٔ رویی ارگانزا باشد، مات و شفاف با هم بازی می‌کنند." },
      { type: "quote", text: "در شب، رنگ عقب می‌نشیند و بافت حرف می‌زند." },
      { type: "p", text: "برای استایل نیمه‌شب، یک کیف جمع و جور با پرداخت فلزی کافی است. کفش را ساده نگه دار تا تمرکز روی خط پیراهن بماند." },
    ],
  },
  {
    slug: "runway-notes-aw26",
    title: "رانوی AW26: شش خروجی، شش داستان",
    excerpt:
      "دفترچهٔ نمایش؛ از تراکوتا و کتان تا کشمیر و چرم. مروری بر آنچه روی صحنه دیدیم و چطور آن را بپوشیم.",
    category: "رانوی",
    date: "۱۶ شهریور ۱۴۰۵",
    readTime: 7,
    image: campaign,
    imageTone: "#efe6d8",
    blocks: [
      { type: "p", text: "صحنه با نور کم شروع شد و با یک پالتوی شتری بلند به پایان رسید. بین این دو، شش استایل تعریف شد؛ هر کدام با یک رنگ غالب و یک نسبت متفاوت." },
      { type: "h", text: "از روی صحنه تا کمد" },
      { type: "p", text: "بخش «خرید بر اساس استایل» در همین سایت، هر شش خروجی را به قطعه‌های مستقل تجزیه می‌کند. می‌توانی کل استایل را یک‌جا اضافه کنی یا فقط آن قطعه‌ای را برداری که در کمدت جا دارد." },
      { type: "quote", text: "استایل روی صحنه متولد می‌شود، اما در زندگی روزمره معنا پیدا می‌کند." },
      { type: "p", text: "برای شروع، از استایل‌های خنثی استفاده کن و بعد رنگ را اضافه. تراکوتا با کرم، نیلی با زغالی و شتری با شکلاتی، سه ترکیبی هستند که در تمام فصل جواب می‌دهند." },
    ],
  },
];

export const getPost = (slug: string | undefined) => POSTS.find((p) => p.slug === slug);

export { hero as HERO_IMAGE, atelier as ATELIER_IMAGE, campaign as CAMPAIGN_IMAGE, look2 as LOOK2_IMAGE, look6 as LOOK6_IMAGE };
