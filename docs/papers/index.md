# Reference Papers — Reading List

> The PDFs themselves are **git-ignored** (≈135 MB, regenerable). The extracted **`.txt`**
> files are committed and grep-able. To (re)download every PDF + extract text:
>
> ```bash
> python3 docs/scripts/fetch_papers.py            # the curated list
> python3 docs/scripts/fetch_papers.py 2106.13281 # or specific arXiv id(s)
> ```
>
> Files are named `<arxiv-id>-<slug>.{pdf,txt}`. Synthesized notes live in
> [`../research/`](../research/).

## Start here (highest leverage for this project)
| Paper | arXiv | Why |
|---|---|---|
| Gym-µRTS | [2105.13807](2105.13807-gym-microrts.txt) | **Closest analog.** Full-RTS DRL SOTA, beat all competition bots in ~60h on **one GPU**. GridNet action repr + invalid-action masking. |
| What Matters in On-Policy RL | [2006.05990](2006.05990-2006.05990.txt) | The empirical PPO design-choice study; our default hyperparameters. |
| AlphaStar Unplugged | [2308.03526](2308.03526-alphastar-unplugged.txt) | Offline-RL recast of StarCraft; BC backbone + value estimation; what's essential. |
| TStarBot-X | [2011.13729](2011.13729-2011.13729.txt) | **Compute-efficient** league training for full SC2 — our league blueprint. |
| Podracer / Anakin | [2104.06272](2104.06272-2104.06272.txt) | "Everything on the accelerator" — the throughput pattern to copy if we go JAX/CUDA. |

## Core RL algorithms
| Paper | arXiv |
|---|---|
| PPO | [1707.06347](1707.06347-ppo.txt) |
| IMPALA + V-trace | [1802.01561](1802.01561-impala-vtrace.txt) |
| Self-Imitation Learning (background for UPGO) | [1806.05635](1806.05635-1806.05635.txt) |
| Sample Factory (APPO, 130k FPS single machine) | [2006.11751](2006.11751-2006.11751.txt) |
| PufferLib (single-node high-throughput RL) | [2406.12905](2406.12905-2406.12905.txt) |

## Model-based / sample efficiency
| Paper | arXiv |
|---|---|
| AlphaZero | [1712.01815](1712.01815-alphazero.txt) |
| MuZero | [1911.08265](1911.08265-muzero.txt) |
| MuZero Unplugged / Reanalyse | [2104.06294](2104.06294-2104.06294.txt) |
| EfficientZero | [2007.05929](2007.05929-efficientzero.txt) · [2111.00210](2111.00210-2111.00210.txt) |
| EfficientZero V2 | [2403.00564](2403.00564-2403.00564.txt) |
| DreamerV3 | [2301.04104](2301.04104-dreamerv3.txt) |
| TD-MPC2 | [2310.16828](2310.16828-2310.16828.txt) |
| BBF (scaling for sample efficiency) | [2305.19452](2305.19452-2305.19452.txt) |

## High-throughput simulation
| Paper | arXiv |
|---|---|
| EnvPool | [2206.10558](2206.10558-2206.10558.txt) |
| Acme / distributed agents (podracer-adjacent) | [2006.07869](2006.07869-podracer-anakin.txt) |

## Self-play, league, population
| Paper | arXiv |
|---|---|
| PSRO (unified game-theoretic MARL) | [1711.00832](1711.00832-1711.00832.txt) |
| Neural Fictitious Self-Play | [1603.01121](1603.01121-1603.01121.txt) |
| Population Based Training | [1711.09846](1711.09846-1711.09846.txt) |
| Minimax Exploiter (data-efficient self-play) | [2311.17190](2311.17190-2311.17190.txt) |
| Kickstarting / policy distillation | [1803.03835](1803.03835-1803.03835.txt) |

## Architecture components
| Paper | arXiv |
|---|---|
| Transformer ("Attention Is All You Need") | [1706.03762](1706.03762-1706.03762.txt) |
| Pointer Networks | [1506.03134](1506.03134-1506.03134.txt) |

## RTS / complex-game environments & agents
| Paper | arXiv |
|---|---|
| SC2LE / PySC2 (StarCraft II env) | [1708.04782](1708.04782-sc2le-starcraft2-env.txt) |
| OpenAI Five (Dota 2) | [1912.06680](1912.06680-openai-five-dota.txt) |
| SMAC | [1902.04043](1902.04043-1902.04043.txt) |
| SMAC revisited / SMACv2 | [2011.07193](2011.07193-smac-revisited.txt) · [2212.07489](2212.07489-2212.07489.txt) |
| mini-AlphaStar | [2104.06890](2104.06890-2104.06890.txt) |
| SCC (efficient SC2 agent) | [2012.13169](2012.13169-2012.13169.txt) |
| JaxMARL / SMAX (GPU-native self-play) | [2311.10090](2311.10090-2311.10090.txt) |
| JueWu (Honor of Kings MOBA) | [1912.09729](1912.09729-1912.09729.txt) |
| JueWu-SL (human-level via SL alone) | [2011.12582](2011.12582-2011.12582.txt) |
| Honor of Kings Arena (RL env) | [2209.08483](2209.08483-2209.08483.txt) |

> Note: the AlphaStar Nature paper (Vinyals et al. 2019) is **not on arXiv**; see the synthesized
> notes in [`../research/alphastar.md`](../research/alphastar.md). DeepMind blog + Methods are the
> canonical source for the architecture, league, and PFSP details.
