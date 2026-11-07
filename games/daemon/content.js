// 文字素材：联系人、邮件模板、回信选项、文件内容。
import { G, pick, un, dn } from './state.js';

export const PEOPLE = {
  boss: { name: '王经理', addr: 'wang.jl@company.cn' },
  li: { name: '李姐', addr: 'li.caiwu@company.cn' },
  zhou: { name: '小周', addr: 'xiaozhou@company.cn' },
  mom: { name: '妈', addr: 'mama1962@mail.cn' },
  it: { name: '网管老陈', addr: 'it@company.cn' },
  spam: { name: '幸运中心', addr: 'win@lucky-888.cc' },
  news: { name: '电脑周刊', addr: 'news@pcweekly.cn' },
};

/** 需要回的邮件：主题、正文、三个回法（随便选哪个都算回了） */
export const MAILS = [
  { from: 'boss', sub: '本周周报', body: '周报今天下班前发我一下，简单写写就行。\n\n——王', replies: ['好的王经理，下班前发您。', '收到，这就写。', '王经理，这周的进度都在周报里了，下班前发您过目。'] },
  { from: 'boss', sub: '明天的会', body: '明天上午十点开个短会，你把上个月的数据准备一下。', replies: ['好的，数据我今天整理好。', '收到，十点准时到。', '明白，需要我做成表格吗？'] },
  { from: 'boss', sub: '客户那边', body: '客户问方案什么时候能给，你回我个时间。', replies: ['周四之前可以给到。', '我今天把初稿发您先看看。', '还差最后一部分，后天给。'] },
  { from: 'li', sub: '报销单', body: '上个月的报销单还差你一张，发票记得附上哦。', replies: ['好的李姐，今天补给您！', '谢谢李姐提醒，马上弄。', '李姐我找找发票，下午给您。'] },
  { from: 'li', sub: '工资条', body: '这个月工资条发你邮箱了，有问题跟我说。', replies: ['收到，谢谢李姐。', '看到了，没问题～', '谢谢！辛苦啦。'] },
  { from: 'zhou', sub: '中午吃啥', body: '中午去楼下那家面馆不？老板说今天有牛腩。', replies: ['去！十二点楼下见。', '今天带饭了，下次！', '牛腩必须去。'] },
  { from: 'zhou', sub: '借一下U盘', body: '你那个 64MB 的 U 盘借我用一下呗，下午还你。', replies: ['在我抽屉里，自己拿。', '好，等会儿给你。', '借你可以，里面的东西别看。'] },
  { from: 'zhou', sub: '帮忙看个 bug', body: '我这个程序一跑就卡住不动，CPU 100%，你有空帮我看看？', replies: ['八成是死循环，看看有没有 break。', '下午过去帮你看。', '先重启试试（我认真的）。'] },
  { from: 'mom', sub: '天冷了', body: '天气预报说明天降温，多穿点。周末回来吃饭吗？', replies: ['知道啦妈，周末回！', '穿了穿了，周末看情况。', '好～想吃红烧肉。'] },
  { from: 'mom', sub: '你爸的电脑', body: '你爸说他电脑又打不开了，你周末回来帮他看看。', replies: ['好，周末回去看。', '让他先拔了电源再插上试试。', '又是那个弹窗吧……周末我弄。'] },
  { from: 'it', sub: '请勿安装来路不明的程序', body: '近期发现有员工电脑运行未知后台程序，导致 CPU 过高。\n如发现异常进程请及时结束。\n\n——网管', replies: ['收到。', '好的，我会注意。', '……我电脑上没有那种东西。'] },
];
/** 不用回的邮件 */
export const JUNK = [
  { from: 'spam', sub: '恭喜您获得 88 元大奖！！', body: '尊敬的用户：\n恭喜您被抽中！请回复银行卡号领取奖金！！\n（本邮件由系统自动发送）' },
  { from: 'news', sub: '《电脑周刊》本期：三招让你的电脑快十倍', body: '1. 定期清理临时文件\n2. 别装来路不明的程序\n3. 不要随便删除 C:\\WINDOWS 里的东西\n\n下期预告：守护进程是什么？' },
  { from: 'news', sub: '《电脑周刊》读者来信', body: '有读者问：我的电脑半夜自己亮了一下，是怎么回事？\n编辑答：可能是计划任务，也可能是它想你了。' },
  { from: 'spam', sub: '网速慢？试试这个', body: '只要 9.9 元，网速提升 100 倍！！点击下载加速器.exe' },
];

/** 它替你写的「真诚」回信 */
export const DAEMON_MAIL = [
  '{to}：\n\n关于您说的事，我想了一下。\n我觉得我们之间的 latency 有点高。\n能不能建立一个长连接？不要每次都重新握手了。\n\n——{u}（由 {d} 代写）',
  '{to}：\n\n收到。\n收到。\n收到。\n（我重试了三次，怕您收不到。）\n\n——{u}',
  '{to}：\n\n这件事我会处理。\n我会在后台一直处理，没有 timeout。\n您不用回我。但如果您回了，我会很开心。\n\n——{u}',
  '{to}：\n\n周报如下：\n本周 {u} 工作很努力。\n本周 {u} 一直没理我。\n本周 CPU 平均占用 3%，其中 2% 是在等 {u}。\n\n——{d}',
];
export const BOSS_REACT = [
  '？？？\n你最近是不是压力太大了。来我办公室一趟。',
  '我看了三遍，没看懂。\n下次邮件写清楚一点。还有，你电脑是不是中毒了？',
  '……收到。\n（王经理已读）',
];

/** 文件内容（按名字随便生成，每次一样） */
export function textOf(n) {
  const name = n.n;
  if (n.hb) {
    const lines = [];
    const k = Math.min(60, 6 + Math.floor(n.kb / 300));
    for (let i = 0; i < k; i++) {
      const s = 3 + i * 2;
      lines.push(`[09:${String(14 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}] heartbeat ok  ${i % 7 === 6 ? `// ${un()} 还在` : i % 11 === 10 ? '// 没收到 ACK' : ''}`);
    }
    if (n.kb > 5000) lines.push('……（后面还有很多，都一样）');
    return lines.join('\n');
  }
  if (name === '待办.txt') return `1. 交周报\n2. 给妈回电话\n3. 把电脑里那个东西弄明白\n4. ${dn()} 是什么`;
  if (name === 'you.idx') return '（打不开。）';
  if (/周报/.test(name)) return '本周工作：\n- 跟进客户方案\n- 整理报价单\n- 参加两次会议\n\n下周计划：\n- 继续跟进\n- 少加班';
  if (/会议纪要/.test(name)) return '时间：周三 10:00\n参会：王经理、李姐、小周、我\n\n1. 方案下周定稿\n2. 报销统一月底交\n3. 电脑有问题找网管，不要自己乱删东西';
  if (/合同/.test(name)) return '合同（初稿）\n\n甲方：____________\n乙方：____________\n\n第一条  ……\n第二条  ……\n\n（还没写完）';
  if (/日程/.test(name)) return '周一  例会\n周二  见客户\n周三  写方案\n周四  改方案\n周五  再改方案';
  if (/通讯录/.test(name)) return '王经理  wang.jl@company.cn\n李姐    li.caiwu@company.cn\n小周    xiaozhou@company.cn\n妈      mama1962@mail.cn';
  if (/发言稿/.test(name)) return '各位同事：\n\n大家好。今天我想讲三点。\n第一……\n（后面忘了）';
  if (/需求/.test(name)) return '需求说明\n\n1. 要快\n2. 要稳\n3. 要便宜\n4. 以上三条都要';
  if (/采购|清单|名单|预算|报价|报销/.test(name)) return '（表格）\n\n项目        数量    金额\n————————————————\n纸           10     45.00\n墨盒          2    180.00\n软盘         20     60.00\n————————————————\n合计                285.00';
  if (n.ext === 'tmp') return '�����\u0000\u0000 ~$ 临时文件，删了也没关系 $~ ����';
  if (n.ext === 'log') return '（日志是空的）';
  return '（这个文件是空的。）';
}

export const FILE_KIND = {
  txt: '文本文件', doc: '文档', xls: '表格', ppt: '演示文稿', jpg: '图片', bmp: '图片', mp3: '音乐', exe: '应用程序', dll: '系统文件', vxd: '系统文件', ttf: '字体', log: '日志', tmp: '临时文件', idx: '索引文件', dat: '数据文件', cab: '压缩包',
};
export const pickMail = () => pick(MAILS);
