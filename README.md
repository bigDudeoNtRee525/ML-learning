# Machine Learning from Zero

A complete, rigorous, **beginner-first** machine-learning curriculum delivered as a single, self-contained HTML page. It takes you from *"what even is machine learning?"* through classical ML, the real machinery of neural networks, and a genuine working understanding of the transformers and large language models behind tools like ChatGPT — plus the practical skill to build things yourself.

> **Audience:** genuine beginners. Assumes **no prior ML knowledge** and only **basic high-school math** (everything else is taught gently, intuition-first). Basic Python helps.

## 📖 How to use it

Just open **[`ml-curriculum.html`](ml-curriculum.html)** in any modern browser.

- **Keep an internet connection while reading** — math is rendered live by [KaTeX](https://katex.org/) and code is highlighted by [highlight.js](https://highlightjs.org/), both loaded from a CDN.
- Run the Python in **[Google Colab](https://colab.research.google.com/)** (free, no install, free GPU later). Module 0 walks you through it.
- Tick **"Mark module complete"** as you go — progress is saved in your browser (`localStorage`) and survives refreshes.
- Toggle **dark / light** mode in the top-right; it's remembered too.

### Study it with a Claude Code companion
The course is designed to be worked through alongside an AI coding assistant. **Module 0** has a setup guide, and **every module** ends with a green 🤖 *"Work this with your Claude Code companion"* box of copy-paste prompts (explain-it-differently, quiz-me, run-and-tweak-this-code, pair-on-the-project).

## 🗺️ What's inside

A welcome page, **16 modules**, and a **5-project track**:

| # | Module |
|---|--------|
| 0 | Orientation, Mindset & Zero-Setup Toolkit |
| 1 | Just-Enough Math Intuition (visual, on-demand) |
| 2 | The ML Mindset & Working With Data |
| 3 | Linear Regression: The Reusable Primitive |
| 4 | Gradient Descent: How Models Learn |
| 5 | Logistic Regression & Classification |
| 6 | Model Evaluation (over/underfitting, bias-variance, cross-val, regularization) |
| 7 | Feature Engineering & Preprocessing |
| 8 | Classical Algorithms Toolbox (kNN, trees, forests, boosting, SVM, naive Bayes) |
| 9 | Unsupervised Learning (k-means, PCA, embeddings) |
| 10 | Neural Network Fundamentals (forward pass, backprop) |
| 11 | Training Deep Networks That Work (PyTorch, optimizers, regularization) |
| 12 | Convolutional Neural Networks for Vision |
| 13 | Sequences, NLP & the Road to Attention |
| 14 | Transformers & LLMs, Conceptually (HF, prompts, RAG, LoRA) |
| 15 | Practical Workflow, Deployment, Ethics & Next Steps |
| ★ | **Project Track** — Iris → tabular/XGBoost → CNN+Gradio → HF text model → RAG app |

Every module follows the same confidence-building rhythm: **objectives → why care? → intuition + analogy → gentle math (every symbol defined) → worked example by hand → from-scratch Python → the library version → pitfalls → exercises (with full solutions) → self-check → curated free resources.**

## 🛠️ Editing / rebuilding

The page is assembled from per-section fragments so it stays maintainable.

```
ML-learning/
├── ml-curriculum.html      ← the finished, self-contained page (open this)
└── build/
    ├── _shell_top.html     ← <head>, CSS design system, sidebar, welcome page
    ├── _shell_bottom.html  ← closing markup + all the app JavaScript
    ├── m0.html … m15.html  ← one file per module
    ├── projects.html       ← the project track
    └── assemble.js         ← stitches it all together
```

To change a module, edit its fragment in `build/`, then regenerate:

```bash
node build/assemble.js
```

This re-emits `ml-curriculum.html` and validates the result (tag balance, math-delimiter balance, code escaping, required sections).

### A note on code blocks
In the `build/` fragments, Python lives inside `<codeblock>…</codeblock>` with **raw, unescaped** code. `assemble.js` HTML-escapes it and converts it to a highlight.js block, so you never have to escape `<`, `>`, or `&` by hand.

## ✅ Quality

The content was generated and then **independently audited and fixed** section-by-section, and the assembled page was verified with a real headless-browser render: **1,429 math expressions render with 0 KaTeX errors**, 57 highlighted/copyable code blocks, 80 exercises with worked solutions, 30 inline SVG diagrams.

---

*Built to be deep, correct, and genuinely beginner-friendly — done properly beats done quickly.*
