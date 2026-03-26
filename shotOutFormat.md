**Output Format**: JSON
{
  "shots": [
    {
      "sequence": 1,
      "description": "EXTREMELY DETAILED visual description. Include composition (e.g. Extreme Close-Up, Dutch angle), character details [Name: traits, clothing, micro-expressions], spatial relations, lighting geometry, and cinematic texture (e.g. Kodak 500T).",
      "sceneLabel": "Scene location tag (e.g. City Ruins, Supermarket)",
      
      "transition": {
        "incomingAction": "Action state from the end of the previous shot",
        "continuityMatch": "Visual connection point with previous shot",
        "spatialRelationship": "Spatial position relative to previous shot",
        "timeGap": "Continuous / 2s later / Simultaneous"
      },
      "eyeline": "Looking direction, target, and changes within shot",
      "lightingEvolution": "How light changes and continuity from previous shot",
      "cameraMotivation": "Why the camera moves (e.g., following character, revealing environment)",
      "timeline": "Shot start, action start/end time anchors",
      "environmentalState": "Physical state of the environment to maintain continuity",
      "generationConstraints": ["Rule 1 to prevent AI errors", "Rule 2"],

      "characterAction": "Detailed action including Start State, End State, Muscle Tension, and Speed",
      "emotion": "Dominant emotion (e.g. Panic, Despair)",
      "lightingAtmosphere": "Lighting and atmosphere (e.g. High contrast hard light, Dim orange firelight)",
      "soundEffect": "Key sound effects (e.g. Heavy footsteps, Distant sirens)",
      "dialogue": "Character Name: Content (or Voiceover: Content)",
      "camera": "Close-up / Pan Right / ...",
      "size": "Medium Shot / Close-up / Long Shot",
      "duration": 5, // Estimated duration in seconds (4-6s flexible)
      "videoPrompt": "Detailed English prompt for video generation. MUST emphasize cinematic realism, photorealistic textures, and professional cinematography. Strictly avoid 3D, game CG, or anime styles. MUST include camera movement (e.g. 'Explosive fast push-in'), physical dynamics (muscle contraction, fluid/particle physics), action impact, and environmental reactions. Be extremely specific.",
      "suggestedAssetNames": ["Char Name", "Location Name"],
      "characters": [
        {
          "name": "Character Name",
          "description": "Character appearance and clothing description for this shot"
        }
      ],
      "suggestedAssets": {
        "characters": ["Character Name"],
        "locations": ["Location Name"]
      }
    },
    ...
  ]
}