/**
 * Canonical category taxonomy.
 *
 * These are product-level categories, so they are seeded as **global** rows
 * (`user_id IS NULL`) and shared by every account. That is the whole point: the
 * old classifier returned names that did not exist in the database, and the
 * save flow only ever looked at the current user's own categories, so every
 * auto-detected name missed and every post saved uncategorised.
 *
 * Keyword lists are deliberately split:
 *   - `strong`  unambiguous, category-defining tokens. A single hit is enough.
 *   - `weak`    suggestive on their own; need a couple to add up.
 *
 * Matching is word-boundary based, never substring. The previous implementation
 * used `includes('it')` and `includes('ai')`, which fired on "with", "email",
 * "detail", "chain" and "unit" and mis-filed most content into Dev & Tech.
 */

export interface CategoryDefinition {
  name: string;
  color_hex: string;
  icon: string;
  strong: string[];
  weak: string[];
  /** Hosts that are themselves a strong signal for this category. */
  domains: string[];
}

export const CATEGORY_TAXONOMY: CategoryDefinition[] = [
  {
    name: 'Programming & DSA',
    color_hex: '#10B981',
    icon: 'Code2',
    strong: [
      'dsa', 'leetcode', 'striver', 'takeuforward', 'codeforces', 'data structure',
      'datastructure', 'algorithm', 'algorithms', 'complexity', 'recursion',
      'linked list', 'binary tree', 'binary search', 'dynamic programming',
      'graph', 'greedy', 'backtracking', 'bit manipulation', 'arrays', 'stacks',
      'queues', 'heaps', 'trie', 'segment tree', 'dp',
    ],
    weak: [
      'sql', 'query', 'queries', 'nosql', 'mongodb', 'postgresql', 'mysql',
      'python', 'java', 'c++', 'cpp', 'rust', 'golang', 'coding', 'code',
      'problem', 'solution', 'practice', 'interview', 'sheet', 'roadmap',
    ],
    domains: ['leetcode.com', 'takeuforward.org', 'codeforces.com', 'geeksforgeeks.org', 'hackerrank.com'],
  },
  {
    name: 'Dev & Software',
    color_hex: '#3B82F6',
    icon: 'Code',
    strong: [
      'react', 'nextjs', 'next.js', 'vue', 'angular', 'svelte', 'flutter',
      'typescript', 'javascript', 'nodejs', 'node.js', 'frontend', 'front-end',
      'backend', 'back-end', 'fullstack', 'full stack', 'api', 'rest api',
      'github', 'devops', 'docker', 'kubernetes', 'microservices', 'mern',
      'web development', 'app development', 'opensource', 'open source',
    ],
    weak: [
      'code', 'coding', 'developer', 'development', 'programming', 'software',
      'library', 'framework', 'debug', 'bug', 'refactor', 'commit', 'repo',
      'repository', 'pull request', 'terminal', 'cli', 'linux', 'server',
      'web', 'app', 'build', 'deploy', 'stack',
    ],
    domains: ['github.com', 'stackoverflow.com', 'dev.to', 'medium.com'],
  },
  {
    name: 'AI & ML',
    color_hex: '#EC4899',
    icon: 'Brain',
    strong: [
      'artificial intelligence', 'machine learning', 'deep learning',
      'neural network', 'neural networks', 'large language model', 'llm',
      'llms', 'generative ai', 'genai', 'openai', 'chatgpt', 'gpt-4', 'gpt-5',
      'claude', 'gemini', 'llama', 'langchain', 'prompt engineering',
      'computer vision', 'nlp', 'transformer', 'diffusion model', 'agentic',
      'fine tuning', 'rag', 'embeddings', 'huggingface', 'pytorch', 'tensorflow',
    ],
    weak: [
      'ai', 'ml', 'model', 'models', 'training', 'dataset', 'inference',
      'automation', 'chatbot', 'copilot', 'midjourney', 'stable diffusion',
    ],
    domains: ['huggingface.co', 'openai.com', 'paperswithcode.com'],
  },
  {
    name: 'System Design & Cloud',
    color_hex: '#8B5CF6',
    icon: 'Server',
    strong: [
      'system design', 'distributed system', 'distributed systems',
      'load balancing', 'scalability', 'high availability', 'consistency',
      'message queue', 'event driven', 'caching', 'rate limiting',
      'aws', 'gcp', 'azure', 'cloud computing', 'terraform', 'infrastructure as code',
      'ci/cd', 'continuous integration', 'observability', 'prometheus',
      'kafka', 'redis', 'elasticsearch',
    ],
    weak: [
      'architecture', 'design', 'scale', 'scaling', 'performance', 'latency',
      'throughput', 'database', 'postgres', 'mysql', 'redis', 'migrate',
      'migration', 'reliability', 'uptime', 'cluster', 'serverless',
    ],
    domains: ['aws.amazon.com', 'cloud.google.com', 'kubernetes.io'],
  },
  {
    name: 'Design & UI/UX',
    color_hex: '#F59E0B',
    icon: 'Palette',
    strong: [
      'ui/ux', 'ui ux', 'user experience', 'user interface', 'figma',
      'wireframe', 'typography', 'color theory', 'design system',
      'interaction design', 'visual design', 'prototyping', 'sketch',
      'canva', 'illustrator', 'animation', 'motion design',
    ],
    weak: [
      'design', 'designer', 'ux', 'ui', 'layout', 'aesthetic', 'brand',
      'logo', 'pixel', 'spacing', 'contrast', 'accessibility',
    ],
    domains: ['figma.com', 'dribbble.com', 'behance.net'],
  },
  {
    name: 'Career & Growth',
    color_hex: '#0EA5E9',
    icon: 'Briefcase',
    strong: [
      'linkedin', 'resume', 'cv', 'curriculum vitae', 'job interview',
      'hiring', 'recruiter', 'cold email', 'portfolio', 'personal brand',
      'startup', 'saas', 'marketing', 'seo', 'growth hacking', 'freelance',
      'side hustle', 'promotion', 'salary negotiation', 'networking',
    ],
    weak: [
      'career', 'job', 'jobs', 'hiring', 'interview', 'offer', 'skill',
      'skills', 'learn', 'learning', 'roadmap', 'productivity', 'habit',
      'habits', 'focus', 'discipline', 'motivation', 'mindset', 'goal',
      'goals', 'study', 'student', 'mentor', 'webinar', 'course', 'certification',
    ],
    domains: ['linkedin.com', 'crunchbase.com', 'glassdoor.com'],
  },
  {
    name: 'Finance & Money',
    color_hex: '#F43F5E',
    icon: 'TrendingUp',
    strong: [
      'personal finance', 'stock market', 'share market', 'mutual fund',
      'index fund', 'etf', 'dividend', 'portfolio allocation', 'real estate',
      'real estate investing', 'cryptocurrency', 'bitcoin', 'ethereum',
      'crypto', 'trading', 'valuation', 'revenue', 'arr', 'mrr', 'burn rate',
      'unit economics', 'saas metrics', 'bookkeeping', 'taxation',
    ],
    weak: [
      'money', 'invest', 'investing', 'invest', 'finance', 'financial',
      'budget', 'saving', 'savings', 'price', 'pricing', 'cost', 'profit',
      'revenue', 'salary', 'income', 'expense', 'expenses', 'tax', 'banking',
      'emi', 'loan', 'insurance', 'retirement', 'wealth',
    ],
    domains: ['zerodha.com', 'moneycontrol.com', 'tradingview.com'],
  },
  {
    name: 'Health & Fitness',
    color_hex: '#22C55E',
    icon: 'HeartPulse',
    strong: [
      'workout', 'gym', 'gymnasium', 'fitness', 'exercise', 'exercising',
      'weightlifting', 'strength training', 'hiit', 'cardio', 'protein',
      'muscle', 'muscles', 'bulking', 'cutting', 'macros', 'calories',
      'nutrition', 'supplement', 'posture', 'stretching', 'yoga', 'meditation',
      'sleep', 'bodybuilding', 'home workout', 'running', 'marathon',
    ],
    weak: [
      'health', 'healthy', 'diet', 'workout', 'strength', 'mobility', 'recovery',
      'wellness', 'mental health', 'anxiety', 'habit', 'hydration', 'cholesterol',
      'blood pressure', 'weight loss', 'weight gain',
    ],
    domains: ['myfitnesspal.com', 'healthline.com', 'examine.com'],
  },
  {
    name: 'Food & Cooking',
    color_hex: '#FB923C',
    icon: 'ChefHat',
    strong: [
      'recipe', 'recipes', 'cooking', 'cook', 'baking', 'bake', 'kitchen',
      'cuisine', 'chef', 'ingredients', 'preparation', 'homemade', 'street food',
      'restaurant', 'vegan recipe', 'dessert', 'curry', 'biryani', 'pasta recipe',
      'smoothie', 'coffee brewing', 'espresso',
    ],
    weak: [
      'food', 'eat', 'eating', 'meal', 'meals', 'taste', 'tastes', 'flavour',
      'flavor', 'snack', 'snacks', 'breakfast', 'lunch', 'dinner', 'bread',
      'vegetarian', 'vegan', 'keto', 'paleo', 'spice', 'spicy', 'sauce',
    ],
    domains: ['seriouseats.com', 'allrecipes.com', 'foodnetwork.com'],
  },
  {
    name: 'Entertainment',
    color_hex: '#A855F7',
    icon: 'Clapperboard',
    strong: [
      'movie', 'movies', 'film', 'films', 'cinema', 'netflix', 'series',
      'web series', 'anime', 'manga', 'tv show', 'sitcom', 'trailer',
      'official trailer', 'music video', 'song', 'album', 'concert',
      'standup', 'stand-up', 'comedy', 'comedy', 'meme', 'memes', 'viral',
      'podcast', 'celebrity', 'hollywood', 'bollywood',
    ],
    weak: [
      'entertainment', 'funny', 'hilarious', 'review', 'rating', 'episode',
      'season', 'actor', 'actress', 'director', 'music', 'singer', 'lyrics',
      'performance', 'show', 'watch', 'streaming',
    ],
    domains: ['netflix.com', 'imdb.com', 'letterboxd.com', 'rottentomatoes.com'],
  },
];

export const DEFAULT_CATEGORY_NAME = 'Uncategorised';

/** Categories seeded for every account. Names must stay in sync with the SQL migration. */
export const GLOBAL_CATEGORY_NAMES = CATEGORY_TAXONOMY.map((c) => c.name);

/**
 * Canonical taxonomy name for a detected label. Maps legacy classifier names
 * onto the current taxonomy; anything else passes through untouched.
 */
export function resolveCategoryName(detected: string): string {
  return LEGACY_CATEGORY_ALIASES[detected.toLowerCase()] ?? detected;
}

/** The taxonomy's colour and icon for a name, when it is a known category. */
export function taxonomyVisual(
  name: string
): { color_hex: string; icon: string } | null {
  const wanted = resolveCategoryName(name).toLowerCase();
  const def = CATEGORY_TAXONOMY.find((c) => c.name.toLowerCase() === wanted);
  return def ? { color_hex: def.color_hex, icon: def.icon } : null;
}

/** Deterministic chip colour for a category with no taxonomy entry. */
export function autoCategoryColor(name: string): string {
  const palette = [
    '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F43F5E',
    '#22C55E', '#A855F7', '#FB923C', '#3B82F6', '#6366F1', '#14B8A6',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/**
 * Legacy names the old classifier could emit, mapped onto the current taxonomy
 * so anything already stored or in flight still resolves to a real category.
 */
export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  'dev & tech': 'Dev & Software',
  'ai & machine learning': 'AI & ML',
  'design & ui/ux': 'Design & UI/UX',
  'linkedin insights': 'Career & Growth',
  'finance & growth': 'Finance & Money',
  tech: 'Dev & Software',
  development: 'Dev & Software',
  coding: 'Programming & DSA',
  programming: 'Programming & DSA',
  algorithms: 'Programming & DSA',
  'data structures': 'Programming & DSA',
  fitness: 'Health & Fitness',
  health: 'Health & Fitness',
  money: 'Finance & Money',
  finance: 'Finance & Money',
  career: 'Career & Growth',
  food: 'Food & Cooking',
};
