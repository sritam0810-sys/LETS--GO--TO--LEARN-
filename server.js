const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Initialize DB
if (!fs.existsSync(DB_FILE)) {
  const defaultDB = {
    teacher: { username: 'teacher', password: 'teacher123', name: 'Teacher' },
    students: [],
    classes: ['UKG','1','2','3','4','5','6','7','8','9','10'],
    subjects: ['Mathematics','Science','English','Social Studies','Hindi','Computer','General Knowledge'],
    questions: [],
    tests: [],
    results: [],
    studentCounter: 0
  };
  writeDB(defaultDB);
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- LOGIN ----------
app.post('/api/login', (req, res) => {
  const { username, password, role } = req.body;
  const db = readDB();
  if (role === 'teacher') {
    if (username === db.teacher.username && password === db.teacher.password) {
      return res.json({ success: true, role: 'teacher', name: db.teacher.name });
    }
  } else {
    const student = db.students.find(s => s.username === username && s.password === password);
    if (student) {
      return res.json({ success: true, role: 'student', name: student.name, class: student.class });
    }
  }
  res.json({ success: false, message: 'Invalid credentials' });
});

// Guest
app.post('/api/guest', (req, res) => {
  const { name, class: cls } = req.body;
  if (!name) return res.json({ success: false });
  res.json({ success: true, name, class: cls, guestId: 'guest_' + Date.now() });
});

// ---------- QUESTIONS ----------
app.post('/api/questions', (req, res) => {
  const db = readDB();
  const { class: cls, subject, question, optionA, optionB, optionC, optionD, correctAnswer } = req.body;
  const newQ = {
    id: Date.now(),
    class: cls,
    subject,
    question,
    optionA, optionB, optionC, optionD,
    correctAnswer,
    type: 'manual',
    createdAt: new Date().toISOString()
  };
  db.questions.push(newQ);
  writeDB(db);
  res.json({ success: true, question: newQ });
});

app.get('/api/questions', (req, res) => {
  const db = readDB();
  const cls = req.query.class;
  res.json(cls ? db.questions.filter(q => q.class === cls) : db.questions);
});

app.delete('/api/questions/:id', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  db.questions = db.questions.filter(q => q.id !== id);
  db.tests.forEach(t => t.questionIds = t.questionIds.filter(qid => qid !== id));
  writeDB(db);
  res.json({ success: true });
});

// PDF to MCQ
app.post('/api/pdf-to-mcq', (req, res) => {
  const { text, class: cls, subject, numQuestions, testName } = req.body;
  if (!text || !cls || !subject) return res.json({ success: false, message: 'Missing fields' });
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
  if (sentences.length < 3) return res.json({ success: false, message: 'Need more text' });
  const generated = [];
  const used = new Set();
  const n = Math.min(numQuestions || 5, sentences.length);
  while (generated.length < n) {
    const idx = Math.floor(Math.random() * sentences.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const sentence = sentences[idx].trim();
    const words = sentence.split(/\s+/);
    if (words.length < 6) continue;
    let keyword = words.find(w => w.length > 3 && /^[A-Z]/.test(w)) || words.reduce((a,b) => a.length > b.length ? a : b);
    keyword = keyword.replace(/[^a-zA-Z]/g, '');
    if (keyword.length < 3) continue;
    const question = sentence.replace(new RegExp(keyword, 'i'), '________');
    const wrongOpts = words.filter(w => w !== keyword && w.length > 2).slice(0,3).map(w => w.replace(/[^a-zA-Z]/g, ''));
    while (wrongOpts.length < 3) wrongOpts.push('Option ' + (wrongOpts.length+1));
    const options = [keyword, ...wrongOpts].sort(() => Math.random() - 0.5);
    const correctIndex = options.indexOf(keyword);
    generated.push({
      id: Date.now() + generated.length,
      class: cls, subject, question,
      optionA: options[0], optionB: options[1], optionC: options[2], optionD: options[3],
      correctAnswer: ['a','b','c','d'][correctIndex],
      type: 'pdf_generated', createdAt: new Date().toISOString()
    });
  }
  const db = readDB();
  db.questions.push(...generated);
  const test = {
    id: Date.now() + 10000,
    name: testName || `${subject} - PDF Test`,
    class: cls, subject,
    questionIds: generated.map(q => q.id)
  };
  db.tests.push(test);
  writeDB(db);
  res.json({ success: true, questions: generated, test });
});

// ---------- TESTS ----------
app.post('/api/tests', (req, res) => {
  const db = readDB();
  const { class: cls, subject, name, questionIds } = req.body;
  db.tests.push({ id: Date.now(), class: cls, subject, name, questionIds });
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/tests', (req, res) => {
  const db = readDB();
  const cls = req.query.class;
  res.json(cls ? db.tests.filter(t => t.class === cls) : db.tests);
});

app.delete('/api/tests/:id', (req, res) => {
  const db = readDB();
  db.tests = db.tests.filter(t => t.id !== parseInt(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// ---------- STUDENTS ----------
app.post('/api/students', (req, res) => {
  const db = readDB();
  const { name, class: cls, password } = req.body;
  db.studentCounter = (db.studentCounter || 0) + 1;
  db.students.push({ name, username: 'student' + db.studentCounter, password, class: cls });
  writeDB(db);
  res.json({ success: true, username: 'student' + db.studentCounter, password });
});

app.get('/api/students', (req, res) => res.json(readDB().students));

app.delete('/api/students/:index', (req, res) => {
  const db = readDB();
  db.students.splice(parseInt(req.params.index), 1);
  writeDB(db);
  res.json({ success: true });
});

// ---------- RESULTS ----------
app.post('/api/results', (req, res) => {
  const db = readDB();
  db.results.push({ ...req.body, date: new Date().toISOString() });
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/results', (req, res) => res.json(readDB().results));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Let's Go to Learn running on port ${PORT}`));
