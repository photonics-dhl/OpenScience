import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@openscience/ai-gateway';
import type { NativeAgentSessionState } from '../src/native-agent/session';
import { createNativeIllustrationMaterializer, nativeIllustrationToolProfile } from '../src/native-agent/illustration-task';
import { materializeIllustrationScience } from '../src/presentation/illustration-planner';
import { compileShotPrompt } from '../src/presentation/synclip-video-spool';

// Exact saved tool input from reviewed a0f2, captured before changing the fresh producer.
// It must remain independent of the R1 fresh factory. This is input, not an expected implementation string.
const OPTIONAL_SAVED_TOOL_INPUT = [
  {
    "name": "paper_overview",
    "description": "Inspect this paper structure, headings, figure captions and available evidence IDs before choosing focused reads.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    }
  },
  {
    "name": "paper_search",
    "description": "Locate literal words, symbols or figure numbers in this paper. This is lexical lookup, not semantic search. Read matching IDs to obtain complete evidence. Word and symbol boundaries rank above incidental inner-word fragments. Excerpts show original context around a hit, not the paragraph prefix. An omitted search result never proves the paper omits a fact; follow its outline or refine the literal query.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "paper_read",
    "description": "Read complete original passages from this paper, preserving their source IDs and page locations. Follow derivation, captions and appendices when needed.",
    "parameters": {
      "type": "object",
      "properties": {
        "passageIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1,
          "maxItems": 12
        }
      },
      "required": [
        "passageIds"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "paper_view",
    "description": "Inspect actual original page pixels for equations, plots, geometry and scientific relations. Pixels will appear in your next turn, with exact paper and page identity.",
    "parameters": {
      "type": "object",
      "properties": {
        "pages": {
          "type": "array",
          "items": {
            "type": "integer",
            "minimum": 1
          },
          "minItems": 1,
          "maxItems": 2
        }
      },
      "required": [
        "pages"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "paper_illustration_context",
    "description": "Read the exact saved six-dimensional paper understanding, Claims and bound sources, eligible originals and requested scope before art. Start here; source IDs sN belong to this immutable selection, whereas paper tools use P IDs. Faithfully illustrate the author's meaning against the source; do not assess the paper's original scientific validity or derive new quantities. Full design guidance is returned on every successful paper_illustration_science result; apply it after preserving the source meaning. Video context includes the verified base plan, supported execution modes and exact per-frame render resources; local revisions preserve every other scene and its prompts. Optional audio supports only external-narration with every scene external-narration, or explicitly requested native-first with every scene native.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {},
      "required": []
    }
  },
  {
    "name": "paper_illustration_science",
    "description": "Save the scientific visual narrative before art. Choose only the scenes needed to convey the paper. Each subject has one exact supporting sN source. Encode direction, quantity meaning, comparison and model conditions explicitly. Labels are the complete visible text inventory, including axis symbols and qualifiers; no citations or hidden extra text. Constraints at most two. Narration <=600 characters; title <=120, mainMessage <=240, audience <=160. Subject and label indices are zero-based. paperOriginalAssetId is null for a designed image or an exact available original asset. This validates structure and binding, not scientific truth. paperOriginalAssetId is optional: omission means a designed image and the tool supplies null. To reuse an original, provide its exact available asset ID. Bibliographic Table/Fig references are structural labels; independent numeric-Hz-family quantities retain their value and unit. Validation feedback identifies affected fields and the explicit source variable when available; it never establishes symbol aliases or substitutes source evidence. Recognized hyphenated scientific units in source prose or consecutive typed quantities are quantities, not subtraction; a complete parenthetical named-variable assignment remains distinct from arithmetic. Explicit local source symbols may have spaced subscripts and an is/of approximation statement; preserve their exact symbol identity, not aliases or arithmetic factors. A bare expression reference can match only that exact whole expression explicitly reported in the same supporting quote. Ordinary complete predicates after a comparison are prose, not units; unknown units remain binding. Use exact case-sensitive source IDs, supports relations and complete supporting text of 12..12000 characters; page markers or qualifiers cannot serve as subject bases. If an independent comparison is written after prose, separate it with a semicolon instead of an ambiguous mathematical wrapper; never remove functions, factors, terms or units. Tell the smallest coherent visual story: do not make a scene for every summary field or auxiliary example. Each displayed quantity or complete expression must be explicitly described by a subject and supported by that subject's own quote; quoting it alone does not describe its object or meaning. Separate a standalone comparison from explanatory prose with a semicolon, retaining its operator, value and units. Quantity feedback names scenes[index] or narrative.mainMessage so repair that exact field and its subject basis. Only availableOriginals supplies original asset IDs; if empty, design a scene with paperOriginalAssetId null. sN is for subject bases; original paper_read uses P IDs. Keep the source case and its necessary conditions together. Complete numbered Fig panel references joined by a slash are structural references, never quantities. Source TeX and displayed notation can match only after complete, bounded format normalization; retain every variable, function, factor and denominator. Unknown syntax remains unsupported; source quotes stay exact. Native narrative video: preserve the complete scientific brief and add videoProduction, durationSeconds and videoDirection. Narration is the complete spoken script, at most 120 characters per scene and 450 total. Use 3–6 scenes of 5/10/15 seconds. Motion, generated elements and continuity cannot add unsupported scientific meaning. Art and final review inspect both exact frame and video prompts. Audio defaults to external-narration for the plan and every scene. Use native-first only when explicitly requested, with audioMode native in every scene. Provider-generated audio must stay grounded in the scene narration and is unverified; exact wording, speaker, timing and quality are not guaranteed. Mixed modes, silent, hybrid and compare-before-publish are unsupported.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string"
        },
        "narrative": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mainMessage": {
              "type": "string"
            },
            "audience": {
              "type": "string"
            }
          },
          "required": [
            "mainMessage",
            "audience"
          ]
        },
        "videoProduction": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "schemaVersion": {
              "const": 1
            },
            "narrativeArc": {
              "type": "string",
              "enum": [
                "question-mechanism-takeaway",
                "question-evidence-limitations",
                "observation-mechanism-limitations"
              ]
            },
            "visualContinuity": {
              "type": "string"
            },
            "audioPolicy": {
              "type": "string",
              "enum": [
                "external-narration",
                "native-first"
              ]
            },
            "modelPolicy": {
              "type": "string",
              "enum": [
                "commercial-primary"
              ]
            }
          },
          "required": [
            "schemaVersion",
            "narrativeArc",
            "visualContinuity",
            "audioPolicy",
            "modelPolicy"
          ]
        },
        "scenes": {
          "type": "array",
          "minItems": 3,
          "maxItems": 6,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {
                "type": "string"
              },
              "narration": {
                "type": "string"
              },
              "message": {
                "type": "string"
              },
              "domain": {
                "type": "string",
                "enum": [
                  "real-space",
                  "wavevector-space",
                  "time",
                  "frequency",
                  "parameter-space",
                  "conceptual"
                ]
              },
              "encoding": {
                "type": "string"
              },
              "labels": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "constraints": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "subjects": {
                "type": "array",
                "minItems": 1,
                "maxItems": 4,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "description": {
                      "type": "string"
                    },
                    "basis": {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "sourceId": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "sourceId"
                      ]
                    }
                  },
                  "required": [
                    "description",
                    "basis"
                  ]
                }
              },
              "paperOriginalAssetId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "durationSeconds": {
                "type": "integer",
                "enum": [
                  5,
                  10,
                  15
                ]
              },
              "videoDirection": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "shotType": {
                    "type": "string",
                    "enum": [
                      "hook",
                      "mechanism",
                      "evidence",
                      "transition",
                      "takeaway",
                      "hero"
                    ]
                  },
                  "purpose": {
                    "type": "string"
                  },
                  "subjectLock": {
                    "type": "string"
                  },
                  "generatedElements": {
                    "type": "string"
                  },
                  "motion": {
                    "type": "string"
                  },
                  "camera": {
                    "type": "string"
                  },
                  "reference": {
                    "type": "string",
                    "enum": [
                      "scene-artwork"
                    ]
                  },
                  "frameStrategy": {
                    "type": "string",
                    "enum": [
                      "start-reference"
                    ]
                  },
                  "audioMode": {
                    "type": "string",
                    "enum": [
                      "external-narration",
                      "native"
                    ]
                  },
                  "subtitleMode": {
                    "type": "string",
                    "enum": [
                      "none"
                    ]
                  },
                  "negativeConstraints": {
                    "type": "array",
                    "maxItems": 8,
                    "items": {
                      "type": "string"
                    }
                  },
                  "modelPolicy": {
                    "type": "string",
                    "enum": [
                      "commercial-primary"
                    ]
                  }
                },
                "required": [
                  "shotType",
                  "purpose",
                  "subjectLock",
                  "generatedElements",
                  "motion",
                  "camera",
                  "reference",
                  "frameStrategy",
                  "audioMode",
                  "subtitleMode",
                  "negativeConstraints",
                  "modelPolicy"
                ]
              }
            },
            "required": [
              "title",
              "narration",
              "message",
              "domain",
              "encoding",
              "labels",
              "constraints",
              "subjects",
              "durationSeconds",
              "videoDirection"
            ]
          }
        }
      },
      "required": [
        "title",
        "narrative",
        "videoProduction",
        "scenes"
      ]
    }
  },
  {
    "name": "paper_illustration_science_repair",
    "description": "After paper_illustration_science returns invalid_illustration, the next assistant message must be exactly one paper_illustration_science_repair tool call: no prose, explanation, full-science resubmission or art JSON. Replace exactly one rejected scene and rerun the same source validator. Keep scienceToolCallId equal to the latest rejected science call; copy the exact scienceToolCallId returned in the invalid_illustration result and never synthesize a name or sequence. Preserve every other scene and root field, and change only the reported scene. Do not use this tool to add new evidence, change the paper meaning, or repair art. (exact scienceToolCallId feedback)",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scienceToolCallId": {
          "type": "string"
        },
        "sceneIndex": {
          "type": "integer",
          "minimum": 0,
          "maximum": 5
        },
        "scene": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {
              "type": "string"
            },
            "narration": {
              "type": "string"
            },
            "message": {
              "type": "string"
            },
            "domain": {
              "type": "string",
              "enum": [
                "real-space",
                "wavevector-space",
                "time",
                "frequency",
                "parameter-space",
                "conceptual"
              ]
            },
            "encoding": {
              "type": "string"
            },
            "labels": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "constraints": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "subjects": {
              "type": "array",
              "minItems": 1,
              "maxItems": 4,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "description": {
                    "type": "string"
                  },
                  "basis": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "sourceId": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "sourceId"
                    ]
                  }
                },
                "required": [
                  "description",
                  "basis"
                ]
              }
            },
            "paperOriginalAssetId": {
              "type": [
                "string",
                "null"
              ]
            },
            "durationSeconds": {
              "type": "integer",
              "enum": [
                5,
                10,
                15
              ]
            },
            "videoDirection": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "shotType": {
                  "type": "string",
                  "enum": [
                    "hook",
                    "mechanism",
                    "evidence",
                    "transition",
                    "takeaway",
                    "hero"
                  ]
                },
                "purpose": {
                  "type": "string"
                },
                "subjectLock": {
                  "type": "string"
                },
                "generatedElements": {
                  "type": "string"
                },
                "motion": {
                  "type": "string"
                },
                "camera": {
                  "type": "string"
                },
                "reference": {
                  "type": "string",
                  "enum": [
                    "scene-artwork"
                  ]
                },
                "frameStrategy": {
                  "type": "string",
                  "enum": [
                    "start-reference"
                  ]
                },
                "audioMode": {
                  "type": "string",
                  "enum": [
                    "external-narration",
                    "native"
                  ]
                },
                "subtitleMode": {
                  "type": "string",
                  "enum": [
                    "none"
                  ]
                },
                "negativeConstraints": {
                  "type": "array",
                  "maxItems": 8,
                  "items": {
                    "type": "string"
                  }
                },
                "modelPolicy": {
                  "type": "string",
                  "enum": [
                    "commercial-primary"
                  ]
                }
              },
              "required": [
                "shotType",
                "purpose",
                "subjectLock",
                "generatedElements",
                "motion",
                "camera",
                "reference",
                "frameStrategy",
                "audioMode",
                "subtitleMode",
                "negativeConstraints",
                "modelPolicy"
              ]
            }
          },
          "required": [
            "title",
            "narration",
            "message",
            "domain",
            "encoding",
            "labels",
            "constraints",
            "subjects",
            "durationSeconds",
            "videoDirection"
          ]
        }
      },
      "required": [
        "scienceToolCallId",
        "sceneIndex",
        "scene"
      ]
    }
  },
  {
    "name": "paper_illustration_art",
    "description": "Apply art to the exact successful scienceToolCallId, one entry per designed scene (skip original-paper scenes). layout chooses placement, reading path and spacing; treatment chooses linework, material, palette and typography. Reference only existing subject and label indices. Never add scientific quantities, marks, objects, symbols or text. Both fields share the remaining complete brief budget. Auto style requires an exact installed family-qualified styleId, explicit style omits it. Recommend the selected style plus at most one useful alternative via styleRecommendations; optional display metadata is not science or visible image text. The result contains the actual complete compiled prompts; inspect them before review. The returned plan also includes inherited video direction and exact video prompts. Preserve science and the complete spoken script.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "scienceToolCallId": {
          "type": "string"
        },
        "scenes": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "layout": {
                "type": "string"
              },
              "treatment": {
                "type": "string"
              },
              "styleId": {
                "type": "string"
              },
              "styleRecommendations": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "selectedStyleId": {
                    "type": "string"
                  },
                  "choices": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 2,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "styleId": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "reason": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "styleId",
                        "name",
                        "reason"
                      ]
                    }
                  }
                },
                "required": [
                  "selectedStyleId",
                  "choices"
                ]
              }
            },
            "required": [
              "layout",
              "treatment"
            ]
          }
        }
      },
      "required": [
        "scienceToolCallId",
        "scenes"
      ]
    }
  },
  {
    "name": "paper_illustration_review",
    "description": "After reading the saved plan and its compiled prompts against source text/pages and relevant scientific/design Skills, review that exact planToolCallId. accepted requires no unresolved scientific/visual ambiguity and empty corrections/issues. blocked records all material defects with exact sN sources; revise science/art through the earlier tools, then review the new plan. Never declare acceptance merely because validation passed. No rewrite inside review. Review the complete video plan, narration, timing, source-bound motion, global continuity and both exact frame/video prompts; accepting only a still image is insufficient.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "planToolCallId": {
          "type": "string"
        },
        "decision": {
          "type": "string",
          "enum": [
            "accepted",
            "blocked"
          ]
        },
        "summary": {
          "type": "string"
        },
        "corrections": {
          "type": "array",
          "maxItems": 0
        },
        "issues": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "sceneIndex": {
                "type": "integer",
                "minimum": 0
              },
              "labelIndex": {
                "type": [
                  "integer",
                  "null"
                ]
              },
              "kind": {
                "type": "string",
                "enum": [
                  "label_clarification",
                  "requires_replan"
                ]
              },
              "requiredMeaning": {
                "type": "string"
              },
              "sourceIds": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "sceneIndex",
              "labelIndex",
              "kind",
              "requiredMeaning",
              "sourceIds"
            ]
          }
        }
      },
      "required": [
        "planToolCallId",
        "decision",
        "summary",
        "corrections",
        "issues"
      ]
    }
  }
];
function optionalSavedProfile() {
  const saved = { turns: [{ request: { options: { tools: OPTIONAL_SAVED_TOOL_INPUT.map(definition => ({ type: 'function', function: definition })) } } }] } as unknown as NativeAgentSessionState;
  return nativeIllustrationToolProfile(saved, 'video');
}

const claims = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'Two regions are connected.', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001',
    relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the source relation with restrained motion.',
  output: 'video' as const, narrative: true as const, narrativeSceneLimit: 3 };
const direction = { shotType: 'mechanism', purpose: 'Explain the relation', subjectLock: 'Two fixed regions', generatedElements: 'Only the connected regions',
  motion: 'Reveal the connection without moving its endpoints', camera: 'Fixed view', reference: 'scene-artwork', frameStrategy: 'start-reference',
  audioMode: 'external-narration', subtitleMode: 'none', negativeConstraints: ['Do not invent a measurement'], modelPolicy: 'commercial-primary' };
const science = { title: 'A connected system', narrative: { mainMessage: 'A source-supported connection', audience: 'A new reader' },
  videoProduction: { schemaVersion: 1, narrativeArc: 'question-mechanism-takeaway', visualContinuity: 'Keep both regions and the connection fixed',
    audioPolicy: 'external-narration', modelPolicy: 'commercial-primary' },
  scenes: ['Question', 'Mechanism', 'Takeaway'].map(title => ({ title, narration: 'These regions are connected.',
    message: 'A conditional relation', domain: 'conceptual', subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }],
    encoding: 'A link represents the relationship of subject 0.', labels: ['Connected regions'], constraints: ['Not to scale'],
    paperOriginalAssetId: null, durationSeconds: 10, videoDirection: direction })) };
const art = { scienceToolCallId: 'science-video', scenes: Array.from({ length: 3 }, () => ({
  layout: 'Place subject 0 at the centre; attach label 0 to it.', treatment: 'Restrained academic linework and readable labels.' })) };
const externalPrompt = [
  'Scientific explainer shot. Preserve approved subject identity, geometry, direction, and causal relationship exactly.',
  'Locale: en. Global continuity bible: Keep both regions and the connection fixed',
  'Scene: Question. Reader-facing narration context: These regions are connected.',
  'Approved visual action: 核心关系：A conditional relation。科学域：conceptual。对象：Connected regions。科学编码：A link represents the relationship of subject 0.。构图：Place subject 0 at the centre; attach label 0 to it.。视觉处理：Restrained academic linework and readable labels.。可见标签：Connected regions。科学限定：Not to scale。',
  'Shot type: mechanism. Purpose: Explain the relation. Locked subject: Two fixed regions. Generated elements: Only the connected regions. Motion: Reveal the connection without moving its endpoints. Camera: Fixed view. Do not: Do not invent a measurement.',
  'Use smooth physically plausible motion, restrained cinematic lighting, and clean scientific composition. Do not render subtitles, formulas, logos, watermarks, or invented labels. Do not change scientific meaning. Spoken narration is external; use only subtle non-verbal ambience if supplied.',
].join('\n');

describe('native Hermes complete video planning', () => {
  it('keeps unmarked R1 pending video on the historical external contract while reading exact optional saved tools', () => {
    const fresh = nativeIllustrationToolProfile(null, 'video');
    expect(fresh).toMatchObject({ nativeVideo: true, videoContext: true, nativeVideoAudio: false });
    expect(fresh.sourceTools.find(tool => tool.name === 'paper_illustration_science')).toMatchObject({ parameters: { properties: {
      videoProduction: { properties: { audioPolicy: { enum: ['external-narration'] } } },
    } } });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...fresh });
    expect(materializer.call('paper_illustration_context', {}, 0, 'context-r1')).toMatchObject({
      settings, videoCapabilities: { audioModes: ['external-narration'] },
    });
    const saved = optionalSavedProfile();
    expect(saved).toMatchObject({ nativeVideo: true, videoContext: true, nativeVideoAudio: true });
    expect(saved.sourceTools).toEqual(OPTIONAL_SAVED_TOOL_INPUT);
  });

  it('reconstructs the historical science and external compiler contract while real rendering stays strict', () => {
    const profile = nativeIllustrationToolProfile(null, 'video');
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = 'native-first';
    candidate.scenes.forEach(scene => { scene.videoDirection.audioMode = 'native'; });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    expect(materializer.call('paper_illustration_science', candidate, 0, 'science-video')).toMatchObject({ status: 'science_ready' });
    const planned = materializer.call('paper_illustration_art', art, 1, 'art-history') as unknown as {
      document: import('@openscience/domain').StoryboardDocument; prompts: Array<{ videoPrompt: string }>;
    };
    expect(planned.prompts[0]!.videoPrompt).toBe(externalPrompt);
    expect(compileShotPrompt(planned.document, planned.document.scenes[0]!, settings.locale)).not.toBe(planned.prompts[0]!.videoPrompt);
  });

  it('selects optional fresh tools only from the owned marker and refuses mismatched saved contracts', () => {
    const fresh = nativeIllustrationToolProfile(null, 'video', 'video-optional-audio-v1');
    expect(fresh).toMatchObject({ nativeVideo: true, videoContext: true, nativeVideoAudio: true });
    expect(fresh.sourceTools).toEqual(OPTIONAL_SAVED_TOOL_INPUT.map(tool => tool.name === 'paper_illustration_art'
      ? { ...tool, description: tool.description + ' Generate exactly one art object for each scene needing design in the latest accepted science, in the same order. Skip preserved original-paper scenes and unchanged scenes outside the selected local revision. Put a style alternative inside that scene\'s existing styleRecommendations; never add an extra scene for an alternative style. Count from the accepted science, not a prior rejected candidate.' }
      : tool));
    const profile = nativeIllustrationToolProfile(null, 'video');
    const old = { turns: [{ request: { options: { tools: profile.sourceTools.map(definition => ({ type: 'function', function: definition })) } } }] } as unknown as NativeAgentSessionState;
    expect(() => nativeIllustrationToolProfile(old, 'video', 'video-optional-audio-v1')).toThrow(/blocked/u);
    expect(() => nativeIllustrationToolProfile(null, 'image', 'video-optional-audio-v1')).toThrow(/blocked/u);
  });

  it.each(['external-narration', 'native-first'])('materializes a marked new %s plan with its exact strict video prompt', policy => {
    const profile = nativeIllustrationToolProfile(null, 'video', 'video-optional-audio-v1');
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = policy;
    candidate.scenes.forEach(scene => { scene.videoDirection.audioMode = policy === 'native-first' ? 'native' : 'external-narration'; });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    expect(materializer.call('paper_illustration_context', {}, 0, 'context-r2')).toMatchObject({ videoCapabilities: { audioModes: ['external-narration', 'native'] } });
    expect(materializer.call('paper_illustration_science', candidate, 0, 'science-video')).toMatchObject({ status: 'science_ready' });
    const planned = materializer.call('paper_illustration_art', art, 1, 'art-r2') as unknown as {
      document: import('@openscience/domain').StoryboardDocument; prompts: Array<{ videoPrompt: string }>;
    };
    expect(planned.document.videoProduction!.audioPolicy).toBe(policy);
    expect(planned.prompts[0]!.videoPrompt).toBe(compileShotPrompt(planned.document, planned.document.scenes[0]!, settings.locale));
    if (policy === 'external-narration') expect(planned.prompts[0]!.videoPrompt).toBe(externalPrompt);
    else expect(planned.prompts[0]!.videoPrompt).not.toBe(externalPrompt);
  });

  it.each(['unknown', null, false, {}])('refuses an invalid optional planning marker %s', marker => {
    expect(() => nativeIllustrationToolProfile(null, 'video', marker as never)).toThrow(/blocked/u);
  });

  it('materializes and exactly replays an explicit native-first all-native plan with the stored compiler prompt', () => {
    const nativeSettings = { ...settings, instruction: 'Use native-first provider audio grounded in the source narration.' };
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = 'native-first';
    candidate.scenes = candidate.scenes.map(scene => ({ ...scene, videoDirection: { ...scene.videoDirection, audioMode: 'native' } }));
    const profile = optionalSavedProfile();
    const materializer = createNativeIllustrationMaterializer({ claims, settings: nativeSettings, paperOriginals: new Map(), ...profile });
    const messages: ChatMessage[] = [];
    for (const [id, name, args] of [['context-new', 'paper_illustration_context', {}], ['science-video', 'paper_illustration_science', candidate],
      ['art-video', 'paper_illustration_art', art], ['review-video', 'paper_illustration_review', { planToolCallId: 'art-video', decision: 'accepted',
        summary: 'The complete source-bound native audio candidate needs output verification.', corrections: [], issues: [] }]] as const) {
      const result = materializer.call(name, args, messages.length, id);
      expect(result.status).not.toBe('invalid_illustration');
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
    }
    const final = '{"reviewToolCallId":"review-video"}', result = materializer.finish(messages, final);
    expect(result.document.videoProduction?.audioPolicy).toBe('native-first');
    for (const [index, scene] of result.document.scenes.entries()) {
      expect(scene.videoDirection?.audioMode).toBe('native');
      expect(result.prompts[index]!.videoPrompt).toBe(compileShotPrompt(result.document, scene, settings.locale));
      expect(result.prompts[index]!.videoPrompt).not.toContain('Spoken narration is external');
    }
    const saved = { turns: [{ request: { options: { tools: profile.sourceTools.map(definition => ({ type: 'function', function: definition })) }, messages } }] } as unknown as NativeAgentSessionState;
    const before = structuredClone(saved);
    const restored = createNativeIllustrationMaterializer({ claims, settings: nativeSettings, paperOriginals: new Map(), savedState: saved, ...nativeIllustrationToolProfile(saved) });
    expect(restored.finish(messages, final)).toEqual(result);
    expect(saved).toEqual(before);
  });

  it.each([
    ['external-narration', 'native'], ['native-first', 'external-narration'], ['native-first', 'mixed'], ['external-narration', 'mixed'],
    ['native-first', 'silent'], ['native-first', 'hybrid'], ['compare-before-publish', 'native'], ['unknown', 'native'],
    ['native-first', 'unknown'], ['native-first', 'missing'], ['missing', 'native'],
  ])('rejects %s/%s before science-plan materialization can succeed', (policy, mode) => {
    const candidate = structuredClone(science);
    candidate.videoProduction.audioPolicy = policy;
    candidate.scenes = candidate.scenes.map((scene, index) => ({ ...scene,
      videoDirection: { ...scene.videoDirection, audioMode: mode === 'mixed' ? index === 0 ? 'native' : 'external-narration' : mode },
    }));
    if (mode === 'missing') Reflect.deleteProperty(candidate.scenes[0]!, 'videoDirection');
    if (policy === 'missing') Reflect.deleteProperty(candidate, 'videoProduction');
    expect(() => materializeIllustrationScience(candidate, claims, settings)).toThrow();
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...optionalSavedProfile() });
    expect(materializer.call('paper_illustration_science', candidate, 0, 'invalid-audio')).toMatchObject({ status: 'invalid_illustration' });
    expect(materializer.call('paper_illustration_art', art, 1, 'no-art')).toMatchObject({ status: 'invalid_illustration' });
  });

  function basePlan(selectedSettings = settings, selectedArt: unknown = art) {
    const materializer = createNativeIllustrationMaterializer({ claims, settings: selectedSettings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    materializer.call('paper_illustration_science', science, 0, 'science-video');
    const planned = materializer.call('paper_illustration_art', selectedArt, 1, 'art-video');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    return { settings: selectedSettings, view: { document: planned.document, locale: selectedSettings.locale, style: selectedSettings.style, output: 'video', narrative: true },
      prompts: planned.prompts, designSkills: [] } as unknown as import('../src/native-agent/illustration-task').VerifiedNativeVideoBase;
  }

  it('keeps the default external plan and its complete prompt bytes unchanged', () => {
    const base = basePlan();
    expect(base.view.document.videoProduction?.audioPolicy).toBe('external-narration');
    expect(base.view.document.scenes.every(scene => scene.videoDirection?.audioMode === 'external-narration')).toBe(true);
    expect(base.prompts[0]!.videoPrompt).toBe(externalPrompt);
  });

  it('records exact frame resources so a local automatic style change leaves other frames reusable', () => {
    const automatic = { ...settings, style: 'auto' };
    const base = basePlan(automatic, { ...art, scenes: art.scenes.map(scene => ({ ...scene, styleId: 'infographic:aged-academia' })) });
    const materializer = createNativeIllustrationMaterializer({ claims, settings: { ...automatic, baseAssetId: 'auto-parent', revisionSceneIndex: 1 },
      base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    expect(materializer.call('paper_illustration_science', science, 0, 'revised-auto')).toMatchObject({ status: 'science_ready' });
    const planned = materializer.call('paper_illustration_art', { scienceToolCallId: 'revised-auto', scenes: [{ ...art.scenes[1],
      styleId: 'article:watercolor', treatment: 'Transparent washes and precise readable labels.' }] }, 1, 'local-auto-art');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    const prompts = planned.prompts as typeof base.prompts;
    expect(prompts[0]).toEqual(base.prompts[0]); expect(prompts[2]).toEqual(base.prompts[2]);
    expect(prompts[1]!.renderResources).not.toEqual(base.prompts[1]!.renderResources);
  });

  it('restricts a local video revision to one scene and preserves the exact other frame and motion prompts', () => {
    const base = basePlan(), revision = { ...settings, baseAssetId: 'parent-video', revisionSceneIndex: 1, instruction: 'Shorten only this scene.' };
    const materializer = createNativeIllustrationMaterializer({ claims, settings: revision, base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    const corrected = structuredClone(science); corrected.scenes[1]!.narration = 'A supported connection.';
    expect(materializer.call('paper_illustration_science', corrected, 0, 'revised-science')).toMatchObject({ status: 'science_ready' });
    expect(materializer.call('paper_illustration_art', { ...art, scienceToolCallId: 'revised-science' }, 1, 'wrong-all-art'))
      .toMatchObject({ status: 'invalid_illustration' });
    const planned = materializer.call('paper_illustration_art', { scienceToolCallId: 'revised-science', scenes: [art.scenes[1]] }, 2, 'local-art');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    const document = planned.document as typeof base.view.document, prompts = planned.prompts as typeof base.prompts;
    expect(document.scenes[0]).toEqual(base.view.document.scenes[0]); expect(document.scenes[2]).toEqual(base.view.document.scenes[2]);
    expect(prompts[0]).toEqual(base.prompts[0]); expect(prompts[2]).toEqual(base.prompts[2]);
    expect(document.scenes[1]!.narration).toBe('A supported connection.');
  });
  it.each(['external-narration', 'native-first'])('finishes an inherited %s selected-scene plan with exact global and unselected content', policy => {
    const { narrativeSceneLimit: _limit, ...ordinarySettings } = settings; void _limit;
    const profile = nativeIllustrationToolProfile(null, 'video', 'video-optional-audio-v1');
    const originalScience = structuredClone(science); originalScience.videoProduction.audioPolicy = policy;
    originalScience.scenes.forEach(scene => { scene.videoDirection.audioMode = policy === 'native-first' ? 'native' : 'external-narration'; });
    const parent = createNativeIllustrationMaterializer({ claims, settings: ordinarySettings, paperOriginals: new Map(), ...profile });
    expect(parent.call('paper_illustration_science', originalScience, 0, 'science-video')).toMatchObject({ status: 'science_ready' });
    const original = parent.call('paper_illustration_art', art, 1, 'parent-art');
    expect(original).toMatchObject({ status: 'art_ready' });
    const base = { settings: ordinarySettings, view: { document: original.document, locale: ordinarySettings.locale, style: ordinarySettings.style,
      output: 'video', narrative: true }, prompts: original.prompts, designSkills: [] } as unknown as import('../src/native-agent/illustration-task').VerifiedNativeVideoBase;
    const revision = { ...ordinarySettings, baseAssetId: '10000000-0000-4000-8000-000000000003', revisionSceneIndex: 1, instruction: 'Shorten only the selected scene.' };
    const child = createNativeIllustrationMaterializer({ claims, settings: revision, base, paperOriginals: new Map(), ...profile });
    const messages: ChatMessage[] = [];
    const call = (name: string, args: unknown, id: string) => {
      const result = child.call(name, args, messages.length, id);
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
      return result;
    };
    const revised = structuredClone(originalScience); revised.scenes[1]!.narration = 'A supported connection.';
    expect(call('paper_illustration_science', revised, 'local-science')).toMatchObject({ status: 'science_ready' });
    const planned = call('paper_illustration_art', { scienceToolCallId: 'local-science', scenes: [art.scenes[1]] }, 'local-art');
    expect(planned, JSON.stringify(planned)).toMatchObject({ status: 'art_ready' });
    expect(call('paper_illustration_review', { planToolCallId: 'local-art', decision: 'accepted', summary: 'The selected change preserves science and all other scenes.',
      corrections: [], issues: [] }, 'local-review')).toMatchObject({ decision: 'accepted' });
    const final = '{"reviewToolCallId":"local-review"}', result = child.finish(messages, final);
    const restored = createNativeIllustrationMaterializer({ claims, settings: revision, base, paperOriginals: new Map(), ...profile });
    expect(restored.finish(messages, final)).toEqual(result);
    const document = planned.document as typeof base.view.document, prompts = planned.prompts as typeof base.prompts;
    expect(document.videoProduction).toEqual(base.view.document.videoProduction); expect(document.narrative).toEqual(base.view.document.narrative);
    for (const index of [0, 2]) { expect(document.scenes[index]).toEqual(base.view.document.scenes[index]); expect(prompts[index]).toEqual(base.prompts[index]); }
    expect(document.scenes[1]!.narration).toBe('A supported connection.');
    expect(prompts[1]!.videoPrompt).toBe(compileShotPrompt(document, document.scenes[1]!, revision.locale));
    const mixed = structuredClone(originalScience); mixed.scenes[1]!.videoDirection.audioMode = policy === 'native-first' ? 'external-narration' : 'native';
    expect(createNativeIllustrationMaterializer({ claims, settings: revision, base, paperOriginals: new Map(), ...profile })
      .call('paper_illustration_science', mixed, 0, 'bad-local-audio')).toMatchObject({ status: 'invalid_illustration' });
  });

  it.each(['continuity', 'narrative', 'title', 'count', 'order', 'other-narration', 'other-motion'] as const)('rejects a local revision that changes %s outside its authorized scene', change => {
      const base = basePlan(), altered = structuredClone(science);
      if (change === 'continuity') altered.videoProduction.visualContinuity = 'Switch between different regions';
      if (change === 'narrative') altered.narrative.mainMessage = 'A different question';
      if (change === 'title') altered.title = 'A different video';
      if (change === 'count') altered.scenes.pop();
      if (change === 'order') [altered.scenes[0], altered.scenes[2]] = [altered.scenes[2]!, altered.scenes[0]!];
      if (change === 'other-narration') altered.scenes[0]!.narration = 'A revised introductory sentence.';
      if (change === 'other-motion') altered.scenes[2]!.videoDirection = { ...direction, camera: 'Pan across the view' };
      const materializer = createNativeIllustrationMaterializer({ claims, settings: { ...settings, baseAssetId: 'parent', revisionSceneIndex: 1 },
        base, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
      expect(materializer.call('paper_illustration_science', altered, 0, 'changed')).toMatchObject({ status: 'invalid_illustration' });
    });

  it('uses the existing science/art/review tools and replays the full video plan without a provider call', () => {
    const profile = nativeIllustrationToolProfile(null, 'video');
    const make = () => createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    const materializer = make(); const messages: ChatMessage[] = [];
    const call = (name: string, args: unknown, id: string) => {
      const result = materializer.call(name, args, messages.length, id);
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
      return result;
    };
    const scientific = call('paper_illustration_science', science, 'science-video');
    expect(scientific, JSON.stringify(scientific)).toMatchObject({ status: 'science_ready' });
    const planned = call('paper_illustration_art', art, 'art-video');
    expect(planned).toMatchObject({ status: 'art_ready', document: { videoProduction: science.videoProduction,
      scenes: science.scenes.map(scene => ({ narration: scene.narration, durationSeconds: 10, videoDirection: direction })) } });
    expect(planned.prompts).toEqual(expect.arrayContaining([expect.objectContaining({ sceneIndex: 0, prompt: expect.any(String),
      videoPrompt: expect.stringContaining(direction.motion) })]));
    expect(call('paper_illustration_review', { planToolCallId: 'art-video', decision: 'accepted', summary: 'The full source-bound video plan is faithful.',
      corrections: [], issues: [] }, 'review-video')).toMatchObject({ decision: 'accepted' });
    const final = '{"reviewToolCallId":"review-video"}';
    const result = materializer.finish(messages, final);
    expect(make().finish(messages, final)).toEqual(result);
    const changed = structuredClone(messages);
    const receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'art-video')!;
    const value = JSON.parse(receipt.content); value.prompts[0].videoPrompt += ' Add an unsupported motion.'; receipt.content = JSON.stringify(value);
    expect(() => make().finish(changed, final)).toThrow(/history changed/u);
  });

  it('restores every capability from the saved video definitions rather than the current output default', () => {
    const fresh = nativeIllustrationToolProfile(null, 'video');
    const saved = { turns: [{ request: { options: { tools: fresh.sourceTools.map(definition => ({ type: 'function', function: definition })) } } }] } as unknown as NativeAgentSessionState;
    expect(nativeIllustrationToolProfile(saved)).toEqual(fresh);
    expect(fresh.nativeVideo).toBe(true);
    expect(nativeIllustrationToolProfile(null).nativeVideo).toBe(false);
  });

  it.each(['Stage A', 'context'] as const)('restores the historical %s video contract and exact paid receipts without upgrading them', stage => {
    // 5f0a80e9 used the image context definition and allowed none/sidecar in the video tool schema.
    const originalTools = structuredClone(nativeIllustrationToolProfile(null, 'video').sourceTools).map(tool => ({ ...tool }));
    const oldContext = nativeIllustrationToolProfile(null).sourceTools.find(tool => tool.name === 'paper_illustration_context')!;
    for (const tool of originalTools) {
      if (tool.name === 'paper_illustration_context') tool.description = stage === 'Stage A' ? oldContext.description : tool.description.split(' Optional audio supports')[0]!;
      if (tool.name === 'paper_illustration_science') tool.description = tool.description.split(' Audio defaults')[0]!;
      if (tool.name === 'paper_illustration_science' || tool.name === 'paper_illustration_science_repair') {
        const schema = tool.parameters as unknown as { properties: {
          videoProduction: { properties: { audioPolicy: { enum: string[] } } };
          scenes: { items: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] }; audioMode: { enum: string[] } } } } } };
          scene: { properties: { videoDirection: { properties: { subtitleMode: { enum: string[] }; audioMode: { enum: string[] } } } } };
        } };
        const scene = tool.name === 'paper_illustration_science' ? schema.properties.scenes.items : schema.properties.scene;
        scene.properties.videoDirection.properties.subtitleMode.enum = stage === 'Stage A' ? ['none', 'sidecar'] : ['none'];
        scene.properties.videoDirection.properties.audioMode.enum = ['external-narration'];
        if (tool.name === 'paper_illustration_science') schema.properties.videoProduction.properties.audioPolicy.enum = ['external-narration'];
      }
    }
    const saved = { turns: [{ request: { options: { tools: originalTools.map(definition => ({ type: 'function', function: definition })) }, messages: [] } }] } as unknown as NativeAgentSessionState;
    const profile = nativeIllustrationToolProfile(saved);
    const before = structuredClone(saved);
    expect(profile.sourceTools).toEqual(originalTools);
    expect(profile).toMatchObject({ nativeVideo: true, videoContext: stage === 'context', scienceFeedback: true, sourceQuantityAnnotations: true,
      sourceQuantityProse: true, sourceQuantityLocations: true, defaultPaperOriginalRef: true, deferDesignGuidance: true,
      scienceRepairCallIdFeedback: true, sourceNotation: true });
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...profile });
    const messages: ChatMessage[] = [];
    for (const [id, name, args] of [['context-old', 'paper_illustration_context', {}], ['science-video', 'paper_illustration_science', science],
      ['art-old', 'paper_illustration_art', art], ['review-old', 'paper_illustration_review', { planToolCallId: 'art-old', decision: 'accepted',
        summary: 'The source-bound complete plan is faithful.', corrections: [], issues: [] }]] as const) {
      const value = materializer.call(name, args, messages.length, id);
      messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
        { role: 'tool', toolCallId: id, content: JSON.stringify(value) });
      if (name === 'paper_illustration_context') {
        if (stage === 'Stage A') expect(Object.keys(value).sort()).toEqual(['availableOriginals', 'claims', 'paper', 'settings', 'status']);
        else expect(value).toMatchObject({ videoCapabilities: { audioModes: ['external-narration'] } });
      }
      if (name === 'paper_illustration_art') {
        if (stage === 'Stage A') expect((value.prompts as Array<unknown>).every(prompt => Object.keys(prompt as object).sort().join(',') === 'prompt,sceneIndex,videoPrompt')).toBe(true);
        expect((value.prompts as Array<{ videoPrompt: string }>)[0]!.videoPrompt).toBe(externalPrompt);
        expect((value.prompts as Array<{ videoPrompt: string }>).every(prompt => prompt.videoPrompt.endsWith('Spoken narration is external; use only subtle non-verbal ambience if supplied.'))).toBe(true);
      }
    }
    const final = '{"reviewToolCallId":"review-old"}', first = materializer.finish(messages, final);
    saved.turns[0]!.request.messages = messages;
    const restored = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: saved, ...nativeIllustrationToolProfile(saved) });
    expect(restored.finish(messages, final)).toEqual(first);
    expect(saved.turns[0]!.request.options.tools).toEqual(before.turns[0]!.request.options.tools);
    const changed = structuredClone(messages), receipt = changed.find(message => message.role === 'tool' && message.toolCallId === 'context-old')!;
    receipt.content = JSON.stringify({ ...JSON.parse(receipt.content), videoCapabilities: { durationSeconds: [5, 10, 15] } });
    expect(() => restored.finish(changed, final)).toThrow(/history changed/u);
    const changedPrompt = structuredClone(messages), artReceipt = changedPrompt.find(message => message.role === 'tool' && message.toolCallId === 'art-old')!;
    const artifact = JSON.parse(artReceipt.content); artifact.prompts[0].videoPrompt += ' changed'; artReceipt.content = JSON.stringify(artifact);
    expect(() => restored.finish(changedPrompt, final)).toThrow(/history changed/u);

    // Read the original deterministic history without upgrading audio or its prompt.
    // Renderer compatibility remains separate: current strict compilation refuses this mismatch.
    const oldNative = structuredClone(saved);
    const oldMessages = oldNative.turns[0]!.request.messages;
    const scienceCall = oldMessages.find(message => message.role === 'assistant' && message.toolCalls?.[0]?.id === 'science-video')!.toolCalls![0]!;
    const oldArgs = JSON.parse(scienceCall.function.arguments); oldArgs.videoProduction.audioPolicy = 'native-first';
    scienceCall.function.arguments = JSON.stringify(oldArgs);
    for (const id of ['science-video', 'art-old']) {
      const receipt = oldMessages.find(message => message.role === 'tool' && message.toolCallId === id)!;
      const value = JSON.parse(receipt.content);
      (id === 'science-video' ? value.intent : value.document).videoProduction.audioPolicy = 'native-first';
      receipt.content = JSON.stringify(value);
    }
    const oldNativeBefore = structuredClone(oldNative);
    const rejected = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: oldNative, ...nativeIllustrationToolProfile(oldNative) });
    const historical = rejected.finish(oldMessages, final);
    expect(historical.prompts[0]!.videoPrompt).toBe(externalPrompt);
    expect(() => compileShotPrompt(historical.document, historical.document.scenes[0]!, settings.locale)).toThrow('VIDEO_PLAN_UNSUPPORTED');
    expect(oldNative).toEqual(oldNativeBefore);

    // All-native history is readable too, but the current renderer's required prompt differs.
    oldArgs.scenes.forEach((scene: typeof science.scenes[number]) => { scene.videoDirection.audioMode = 'native'; });
    scienceCall.function.arguments = JSON.stringify(oldArgs);
    for (const id of ['science-video', 'art-old']) {
      const receipt = oldMessages.find(message => message.role === 'tool' && message.toolCallId === id)!;
      const value = JSON.parse(receipt.content);
      (id === 'science-video' ? value.intent : value.document).scenes.forEach((scene: typeof science.scenes[number]) => { scene.videoDirection.audioMode = 'native'; });
      receipt.content = JSON.stringify(value);
    }
    const allNativeBefore = structuredClone(oldNative);
    const stalePrompt = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), savedState: oldNative, ...nativeIllustrationToolProfile(oldNative) });
    const allNative = stalePrompt.finish(oldMessages, final);
    expect(allNative.prompts[0]!.videoPrompt).toBe(externalPrompt);
    expect(compileShotPrompt(allNative.document, allNative.document.scenes[0]!, settings.locale)).not.toBe(allNative.prompts[0]!.videoPrompt);
    expect(oldNative).toEqual(allNativeBefore);
  });

  it('keeps video motion quantities source-bound and repairs only the exact rejected scene', () => {
    const materializer = createNativeIllustrationMaterializer({ claims, settings, paperOriginals: new Map(), ...nativeIllustrationToolProfile(null, 'video') });
    const bad = structuredClone(science); bad.scenes[1]!.videoDirection = { ...direction, motion: 'A measured separation of 77 nm appears.' };
    const rejected = materializer.call('paper_illustration_science', bad, 0, 'rejected-video');
    expect(rejected).toMatchObject({ status: 'invalid_illustration', scienceToolCallId: 'rejected-video' });
    expect(String(rejected.error)).toContain('videoDirection.motion');
    expect(materializer.call('paper_illustration_science_repair', { scienceToolCallId: 'wrong-call', sceneIndex: 1, scene: science.scenes[1] }, 1, 'wrong-repair'))
      .toMatchObject({ status: 'invalid_illustration' });
    expect(materializer.call('paper_illustration_science_repair', { scienceToolCallId: 'rejected-video', sceneIndex: 1, scene: science.scenes[1] }, 2, 'fixed-video'))
      .toMatchObject({ status: 'science_ready', intent: { videoProduction: science.videoProduction } });
  });
});
