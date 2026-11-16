import React, { useId } from 'react';

const hairstyles = {
  swept: {
    shape: 'M159 114C151 104 146 88 150 72C149 63 155 55 164 51C160 47 158 42 158 37C169 44 179 40 191 34C208 25 225 30 233 39C249 39 260 56 254 73C255 86 249 100 241 111L235 83C221 93 202 87 185 92C174 95 167 102 166 116Z',
    strands: ['M163 69C177 47 207 39 228 48', 'M170 78C187 61 215 66 235 56', 'M157 84C157 95 160 103 163 107'],
  },
  short: {
    shape: 'M159 114C151 102 149 86 153 72C157 53 173 44 191 43C199 36 214 38 221 43C240 42 254 58 251 80L242 114L234 85C216 91 191 80 172 92L166 116Z',
    strands: ['M165 70C182 52 207 54 226 57', 'M176 77C194 65 218 78 238 67'],
  },
  curly: {
    shape: 'M158 113C147 108 145 99 149 92C136 86 139 74 147 70C140 58 148 48 159 48C157 35 171 30 180 37C185 23 201 25 207 34C220 23 233 31 233 41C249 36 259 47 253 59C268 64 267 77 257 82C262 96 253 106 242 111L233 84C217 94 190 91 173 90L166 116Z',
    strands: ['M154 65Q160 50 173 59', 'M176 45Q187 38 193 49', 'M209 48Q222 38 229 53', 'M239 65Q250 67 248 78'],
  },
  long: {
    shape: 'M159 117C144 93 150 60 172 47C195 32 227 39 244 57C257 72 253 102 242 120L232 82C219 99 192 100 176 109L168 124Z',
    strands: ['M164 87C166 63 185 48 204 48', 'M181 94C203 87 220 73 224 57', 'M232 58C244 69 248 91 243 105'],
  },
  bob: {
    shape: 'M157 121C144 95 149 62 170 48C194 33 228 38 245 58C257 74 254 104 244 123L233 84C220 96 193 92 175 103L166 124Z',
    strands: ['M160 88C163 64 182 48 203 48', 'M210 49C229 54 242 73 243 96', 'M176 89C192 84 214 84 228 77'],
  },
  bun: {
    shape: 'M159 117C147 96 150 71 161 57C178 37 216 37 236 53C253 67 253 95 242 118L231 82C216 88 190 83 175 94L168 120Z',
    strands: ['M160 82C170 60 188 49 204 49', 'M205 49C223 52 237 67 242 88', 'M178 82C193 75 216 76 229 71'],
  },
  ponytail: {
    shape: 'M159 116C147 95 150 68 164 53C184 36 220 37 238 55C253 71 251 98 242 118L232 83C215 89 191 84 174 96L166 119Z',
    strands: ['M162 83C172 60 190 48 208 49', 'M206 49C224 53 238 69 242 90', 'M179 84C196 76 218 76 231 70'],
  },
  buzz: {
    shape: 'M159 99C154 72 170 48 197 47C226 44 248 67 244 100L235 86C214 79 186 79 168 89Z',
    strands: ['M168 74C185 57 215 58 234 74'],
  },
};

function tint(hex, target, amount) {
  const color = parseInt(hex.slice(1), 16);
  const other = parseInt(target.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => Math.round(((color >> shift) & 255) * (1 - amount) + ((other >> shift) & 255) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export default function CharacterArt({ settings, ...props }) {
  const {
    skinColor, hairColor, eyeColor, shirtColor, accentColor, laptopColor,
    characterStyle, hairStyle, outfit, glasses, expression, facialHair,
    showHeadphones, showBooks, showPlant, showMug, showBackdrop,
  } = settings;
  const isFemale = characterStyle === 'female';
  const id = useId().replace(/:/g, '');
  const paint = (name) => `url(#${id}-${name})`;
  const outline = '#25364a';
  const hair = hairstyles[hairStyle];

  return (
    <svg viewBox="0 0 480 330" fill="none" xmlns="http://www.w3.org/2000/svg" data-character-style={isFemale ? 'female' : 'male'} {...props}>
      <defs>
        <linearGradient id={`${id}-skin`} x1="160" y1="65" x2="236" y2="178" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(skinColor, '#ffffff', .18)} /><stop offset=".52" stopColor={skinColor} /><stop offset="1" stopColor={tint(skinColor, '#6e4532', .18)} />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="172" y1="34" x2="231" y2="131" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(hairColor, '#ffffff', .14)} /><stop offset=".55" stopColor={hairColor} /><stop offset="1" stopColor={tint(hairColor, '#000000', .22)} />
        </linearGradient>
        <linearGradient id={`${id}-shirt`} x1="153" y1="186" x2="276" y2="268" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(shirtColor, '#ffffff', .16)} /><stop offset=".45" stopColor={shirtColor} /><stop offset="1" stopColor={tint(shirtColor, '#000000', .22)} />
        </linearGradient>
        <linearGradient id={`${id}-laptop`} x1="280" y1="196" x2="393" y2="275" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(laptopColor, '#ffffff', .24)} /><stop offset=".58" stopColor={laptopColor} /><stop offset="1" stopColor={tint(laptopColor, '#000000', .16)} />
        </linearGradient>
        <linearGradient id={`${id}-laptop-deck`} x1="249" y1="250" x2="317" y2="279" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(laptopColor, '#ffffff', .45)} /><stop offset="1" stopColor={tint(laptopColor, '#ffffff', .18)} />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={tint(accentColor, '#ffffff', .58)} /><stop offset="1" stopColor={accentColor} />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x1="49" y1="190" x2="91" y2="246" gradientUnits="userSpaceOnUse">
          <stop stopColor="#86efac" /><stop offset=".45" stopColor="#34a875" /><stop offset="1" stopColor="#1e6b4f" />
        </linearGradient>
        <radialGradient id={`${id}-blush`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#d95f52" stopOpacity=".24" />
          <stop offset="100%" stopColor="#d95f52" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-screen-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity=".35" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showBackdrop && <g className="character-scene-details" stroke={accentColor} strokeLinecap="round" opacity=".55">
        <circle cx="352" cy="130" r="35" strokeOpacity=".4" />
        <circle cx="352" cy="130" r="25" strokeOpacity=".26" />
        <path d="M352 114V130L363 137" strokeWidth="2" />
        <path d="M108 118V130M102 124H114M304 65V75M299 70H309" strokeWidth="2" />
        <circle cx="101" cy="161" r="3.2" fill={accentColor} stroke="none" />
        <circle cx="395" cy="84" r="2.2" fill={accentColor} stroke="none" />
      </g>}

      <g stroke={outline} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {/* Desk shadow + baseline */}
        <ellipse cx="259" cy="300" rx="192" ry="8.5" fill={outline} fillOpacity=".1" stroke="none" />
        <path d="M55 295H448" strokeOpacity=".16" />

        {/* Back hair & behind-head accessories */}
        <g className="character-head">
          {hairStyle === 'long' && <>
            <path d="M161 65C136 89 133 122 138 156C141 182 132 197 141 218C171 232 232 228 261 213C254 191 263 171 257 143C255 113 256 84 237 63Z" fill={paint('hair')} />
            <path d="M153 109C146 146 156 177 147 207M245 108C254 143 242 177 251 207" stroke={tint(hairColor, '#ffffff', .25)} strokeOpacity=".5" />
          </>}
          {hairStyle === 'bob' && <>
            <path d="M156 69C137 91 134 128 143 157C152 169 165 174 177 171L233 170C244 173 255 167 259 152C264 126 260 88 240 66Z" fill={paint('hair')} />
            <path d="M148 112C146 132 149 149 154 159M252 110C254 130 250 148 245 157" stroke={tint(hairColor, '#ffffff', .22)} strokeOpacity=".5" />
          </>}
          {hairStyle === 'bun' && <>
            <circle cx="225" cy="42" r="24" fill={paint('hair')} />
            <path d="M211 31C222 22 239 31 238 43M215 44C220 51 233 50 238 43" stroke={tint(hairColor, '#ffffff', .24)} strokeOpacity=".6" />
            <path d="M210 60L237 63" stroke={accentColor} strokeWidth="4" />
          </>}
          {hairStyle === 'ponytail' && <>
            <path d="M236 68C262 67 278 90 274 124C271 151 280 171 268 189C255 179 248 164 250 144C251 124 246 101 234 86Z" fill={paint('hair')} />
            <path d="M254 89C265 110 264 142 259 166" stroke={tint(hairColor, '#ffffff', .24)} strokeOpacity=".5" />
            <circle cx="240" cy="76" r="5" fill={accentColor} />
          </>}
        </g>

        {/* Torso + Neck */}
        <path d="M139 267C137 236 141 207 158 190C169 179 181 176 194 175H220C239 177 258 185 270 203C282 220 286 245 290 267Z" fill={paint('shirt')} />
        <path d="M145 222C143 241 146 254 147 266H170L161 223ZM272 221L286 267H267L260 230Z" fill={outline} fillOpacity=".1" stroke="none" />
        <path d="M164 190C171 185 179 182 187 181" stroke="white" strokeOpacity=".22" strokeWidth="3" />
        <path d={isFemale ? 'M184 146L184 177C188 193 216 196 223 178L222 146Z' : 'M178 146L179 177C183 194 219 199 228 179L226 146Z'} fill={paint('skin')} />
        <path d={isFemale ? 'M184 151C192 169 213 173 222 155L222 165C214 179 193 178 184 165Z' : 'M179 151C188 170 215 176 226 155L226 166C216 181 191 179 179 166Z'} fill={outline} fillOpacity=".14" stroke="none" />

        {/* Outfits */}
        {outfit === 'polo' && <>
          <path d="M176 176L202 193L189 208L163 184Z" fill={paint('paper')} />
          <path d="M227 176L202 193L215 208L239 185Z" fill={paint('paper')} />
          <path d="M202 194V245" stroke={accentColor} strokeOpacity=".85" />
          <path d="M205 202V243" stroke={outline} strokeOpacity=".15" />
          <circle cx="208" cy="215" r="1.8" fill={accentColor} stroke="none" />
          <circle cx="208" cy="230" r="1.8" fill={accentColor} stroke="none" />
        </>}
        {outfit === 'tshirt' && <>
          <path d="M175 176C181 195 220 198 230 177L239 183C228 210 178 211 165 183Z" fill={accentColor} />
          <path d="M175 185C187 202 217 203 230 186" stroke={outline} strokeOpacity=".16" />
        </>}
        {outfit === 'hoodie' && <>
          <path d="M171 176L155 191L183 215L202 195L221 215L247 191L232 176C224 199 182 202 171 176Z" fill={paint('paper')} />
          <path d="M171 184L184 204L202 195L221 204L233 184" stroke={outline} strokeOpacity=".18" />
          <path d="M186 211L182 241M220 211L224 239" stroke={accentColor} strokeWidth="2.5" />
          <path d="M182 237V244M224 236V242" stroke={outline} strokeWidth="2.5" strokeOpacity=".5" />
          <path d="M181 257Q204 245 230 257" stroke={accentColor} strokeOpacity=".6" />
        </>}
        {outfit === 'sweater' && <>
          <path d="M174 176C181 192 221 194 231 176L237 183C226 203 180 203 168 183Z" fill={paint('paper')} />
          <path d="M173 178C183 197 220 198 232 179" stroke={outline} strokeOpacity=".18" strokeWidth="1.2" />
          <path d="M180 185L176 193M191 190L189 198M204 192V200M217 190L219 198M228 185L231 193" stroke={outline} strokeOpacity=".22" strokeWidth="1.2" />
          <path d="M167 216Q205 227 248 216" stroke="white" strokeOpacity=".15" strokeWidth="2" />
        </>}
        {outfit === 'blazer' && <>
          <path d="M177 176L203 243L228 176C215 190 191 190 177 176Z" fill={paint('paper')} />
          <path d="M198 189L203 236L208 189Z" fill={tint(shirtColor, '#0f172a', .35)} stroke="none" />
          <path d="M174 177L160 194L177 212L173 219L199 246L180 179Z" fill={tint(shirtColor, '#0f172a', .18)} />
          <path d="M230 177L244 194L227 212L231 219L205 246L224 179Z" fill={tint(shirtColor, '#0f172a', .18)} />
        </>}

        {/* School crest pin on chest */}
        <g stroke={accentColor} strokeWidth="1.4" opacity=".85">
          <path d="M241 208V220Q247 225 253 220V208Z" />
          <path d="M244 213L247 212L250 213V218L247 217L244 218ZM247 212V217" strokeWidth="1" />
        </g>

        {/* Left sleeve */}
        <path d="M146 205L132 228L162 242L177 216Z" fill={paint('shirt')} />
        <path d="M134 225L163 238" stroke={accentColor} strokeWidth="3" />

        {/* Subtle desk screen glow */}
        <ellipse cx="268" cy="240" rx="52" ry="26" fill={paint('screen-glow')} stroke="none" />

        {/* Laptop keyboard base */}
        <g className="character-laptop-base">
          <ellipse cx="312" cy="282" rx="90" ry="4.5" fill={outline} fillOpacity=".12" stroke="none" />
          <path d="M218 250H354L399 274H263Z" fill={paint('laptop-deck')} strokeWidth="1.3" />
          <path d="M218 250V255L263 279H399V274H263Z" fill={tint(laptopColor, '#000000', .18)} strokeWidth="1.2" />
          <g className="character-laptop-keyboard" transform="matrix(1 0 -1.125 -.6 263 274)" stroke="none">
            <rect x="9" y="4" width="118" height="18" rx="2" fill={outline} fillOpacity=".26" />
            {[0, 1, 2, 3].map((row) => <g key={row} fill={tint(laptopColor, '#000000', .36)}>
              {Array.from({ length: 12 }, (_, column) => <rect key={column} x={11 + column * 9.5} y={5 + row * 4} width="7.5" height="2.8" rx=".6" />)}
            </g>)}
            <rect x="49" y="26" width="39" height="10" rx="2" fill={laptopColor} fillOpacity=".28" stroke={outline} strokeOpacity=".4" strokeWidth=".7" />
          </g>
          <path d="M265 277H395" stroke="white" strokeOpacity=".25" strokeWidth=".8" />
          <path d="M226 257L233 261M238 264L249 270" stroke={outline} strokeOpacity=".55" strokeWidth="1.3" />
          <circle className="character-laptop-light" cx="255" cy="273.4" r="1.1" fill="#93c5fd" stroke="none" />
        </g>

        {/* Left hand */}
        <g className="character-hand character-hand-left">
          <path d="M134 229L159 239L158 253L216 254C224 250 232 251 239 255L252 264C257 269 252 274 246 273L224 266L148 275C131 274 126 258 131 241Z" fill={paint('skin')} />
          <path d="M138 259C139 267 146 271 153 270L207 264" stroke="white" strokeOpacity=".22" strokeWidth="3" />
          <path d="M222 257Q230 259 236 268M232 256L244 268M240 259L250 267" strokeOpacity=".35" strokeWidth="1.3" />
          <path d="M216 264L225 267" strokeOpacity=".22" strokeWidth="1.2" />
        </g>

        {/* Right sleeve + hand */}
        <path d="M257 208L278 234L255 249L239 221Z" fill={paint('shirt')} />
        <path d="M257 243L276 232" stroke={accentColor} strokeWidth="3" />
        <g className="character-hand character-hand-right">
          <path d="M275 235L256 246L278 265L309 267C316 267 321 262 316 257L286 251Z" fill={paint('skin')} />
          <path d="M285 258L307 263M300 256L307 263M309 258L314 263" strokeOpacity=".28" strokeWidth="1.3" />
        </g>

        {/* Head & facial features */}
        <g className="character-head">
          {/* Ears */}
          <ellipse cx="156" cy="116" rx={isFemale ? 8 : 9} ry="13" fill={paint('skin')} />
          <ellipse cx="246" cy="116" rx={isFemale ? 8 : 9} ry="13" fill={paint('skin')} />
          <path d="M155 111Q149 115 156 121M246 111Q252 115 246 121" strokeOpacity=".3" strokeWidth="1.4" />

          {/* Face shape */}
          <path className="character-face" d={isFemale ? 'M160 94C158 68 175 49 200 49C228 47 246 69 244 96L241 126C238 147 225 165 202 174C181 169 167 150 163 127Z' : 'M159 94C158 68 174 49 200 49C229 47 247 69 245 96L242 128C239 152 223 173 202 176C180 174 164 154 161 129Z'} fill={paint('skin')} />
          <path d="M165 98C164 78 175 62 187 59" stroke="white" strokeOpacity=".2" strokeWidth="5" />
          <path d="M239 111C239 142 224 164 205 168" stroke={outline} strokeOpacity=".08" strokeWidth="5" />

          {/* Soft blush glow */}
          <ellipse cx="176" cy="133" rx="13" ry="7" fill={paint('blush')} stroke="none" />
          <ellipse cx="229" cy="133" rx="13" ry="7" fill={paint('blush')} stroke="none" />

          {/* Front hair */}
          {hair && <g>
            <path d={hair.shape} fill={paint('hair')} />
            <g stroke={tint(hairColor, '#ffffff', .28)} strokeOpacity=".45" strokeWidth="2.2">
              {hair.strands.map((strand) => <path key={strand} d={strand} />)}
            </g>
          </g>}

          {/* Eyebrows */}
          <path
            d={expression === 'focused'
              ? 'M173 103L192 105M212 105L231 103'
              : isFemale
                ? 'M173 102Q182 95 192 101M212 101Q222 95 232 102'
                : 'M173 102Q182 97 191 102M212 102Q222 97 231 103'}
            stroke={hairColor}
            strokeWidth={isFemale ? 2.1 : 3}
          />

          {/* Eyes */}
          <g className="character-eyes">
            {expression === 'happy' ? (
              <>
                <path d="M174 116Q183 108 193 116" strokeWidth="2.6" />
                <path d="M213 116Q222 108 232 116" strokeWidth="2.6" />
              </>
            ) : (
              <>
                <path d="M173 115Q183 107 194 115Q184 123 173 115Z" fill="#fffdf8" strokeWidth="1.2" />
                <ellipse cx="184" cy="115" rx="4.7" ry="5.2" fill={eyeColor} stroke="none" />
                <ellipse cx="184.6" cy="115.5" rx="2.1" ry="3.1" fill={outline} stroke="none" />
                <circle cx="182.6" cy="112.6" r="1.6" fill="white" stroke="none" />
                <circle cx="186.2" cy="117.5" r=".7" fill="white" fillOpacity=".7" stroke="none" />
                {isFemale && <path d="M173 114L170 111M176 112L174 108" strokeWidth="1.5" />}
                {expression === 'wink' ? <path d="M212 115Q222 108 232 115" strokeWidth="2.6" /> : <>
                  <path d="M212 115Q222 107 233 115Q222 123 212 115Z" fill="#fffdf8" strokeWidth="1.2" />
                  <ellipse cx="222" cy="115" rx="4.7" ry="5.2" fill={eyeColor} stroke="none" />
                  <ellipse cx="222.6" cy="115.5" rx="2.1" ry="3.1" fill={outline} stroke="none" />
                  <circle cx="220.6" cy="112.6" r="1.6" fill="white" stroke="none" />
                  <circle cx="224.2" cy="117.5" r=".7" fill="white" fillOpacity=".7" stroke="none" />
                  {isFemale && <path d="M232 114L235 111M230 112L232 108" strokeWidth="1.5" />}
                </>}
              </>
            )}
          </g>

          {/* Nose */}
          <path d="M203 118L199 130Q202 134 208 131" strokeOpacity=".36" strokeWidth="1.4" />

          {/* Facial hair */}
          {facialHair !== 'none' && <path d="M170 135Q181 146 192 143L202 140L214 144Q228 145 236 135C232 157 219 173 202 176C184 172 174 157 170 135Z" fill={paint('hair')} opacity={facialHair === 'stubble' ? '.24' : '.92'} stroke="none" />}

          {/* Mouth */}
          {expression === 'neutral' ? (
            <>
              <path d="M191 145Q202 149 214 145" strokeWidth="1.8" />
              <path d="M198 153H207" stroke="#fff5e7" strokeOpacity=".25" />
            </>
          ) : expression === 'focused' ? (
            <>
              <path d="M190 144Q202 149 214 144" strokeWidth="1.8" />
              <path d="M199 152H206" stroke={outline} strokeOpacity=".15" strokeWidth="1.2" />
            </>
          ) : (
            <>
              <path d={expression === 'happy' ? 'M181 139Q202 152 224 138C219 157 210 162 200 161C192 160 185 151 181 139Z' : 'M184 140Q202 150 222 139C217 154 209 159 200 158C193 157 187 150 184 140Z'} fill="#824b43" strokeWidth="1.2" />
              <path d={expression === 'happy' ? 'M186 142Q203 151 220 141L216 149Q202 155 189 148Z' : 'M188 143Q203 150 218 142L215 148Q202 153 191 147Z'} fill="#fffdf5" stroke="none" />
              <path d="M197 156Q203 152 209 155" stroke="#d8897c" strokeWidth="1.5" />
            </>
          )}

          {/* Glasses */}
          {glasses !== 'none' && <g stroke={tint(hairColor, outline, .5)} strokeWidth="2.2">
            {glasses === 'round' ? <>
              <circle cx="183" cy="115" r="14.5" fill="white" fillOpacity=".09" />
              <circle cx="222" cy="115" r="14.5" fill="white" fillOpacity=".09" />
            </> : glasses === 'browline' ? <>
              <rect x="167" y="102" width="32" height="25" rx="7" fill="white" fillOpacity=".09" strokeWidth="1.4" />
              <rect x="206" y="102" width="32" height="25" rx="7" fill="white" fillOpacity=".09" strokeWidth="1.4" />
              <path d="M167 108Q183 99 199 107M206 107Q222 99 238 108" strokeWidth="3.6" />
            </> : <>
              <rect x="167" y="102" width="32" height="25" rx="6" fill="white" fillOpacity=".09" />
              <rect x="206" y="102" width="32" height="25" rx="6" fill="white" fillOpacity=".09" />
            </>}
            <path d="M198 113Q202 109 207 113M168 110L159 107M238 110L245 107" />
            <path d="M175 107L172 112M214 107L211 112" stroke="white" strokeOpacity=".55" strokeWidth="1.6" />
          </g>}

          {/* Optional Over-Ear Studio Headphones */}
          {showHeadphones && <g className="character-headphones">
            <path d="M153 108C151 64 172 42 202 42C232 42 252 64 250 108" stroke={tint(laptopColor, '#0f172a', .25)} strokeWidth="6.5" fill="none" />
            <path d="M155 103C154 66 173 45 202 45C231 45 249 66 248 103" stroke={accentColor} strokeWidth="1.8" strokeOpacity=".5" fill="none" />
            <rect x="145" y="99" width="13" height="29" rx="6.5" fill={tint(laptopColor, '#0f172a', .2)} />
            <rect x="245" y="99" width="13" height="29" rx="6.5" fill={tint(laptopColor, '#0f172a', .2)} />
            <rect x="148" y="104" width="6" height="19" rx="3" fill={accentColor} stroke="none" fillOpacity=".65" />
            <rect x="249" y="104" width="6" height="19" rx="3" fill={accentColor} stroke="none" fillOpacity=".65" />
          </g>}
        </g>

        {/* Laptop lid (front-facing back of screen) */}
        <g className="character-laptop-lid">
          <path d="M280 196H413C420 196 423 201 421 207L398 269Q397 274 391 274H262Q256 274 258 268L275 202Q276 196 280 196Z" fill={paint('laptop')} strokeWidth="1.6" />
          <path d="M280 199H412Q418 199 418 204" stroke="white" strokeOpacity=".38" strokeWidth="1.3" />
          <path d="M277 204L261 267" stroke="white" strokeOpacity=".22" strokeWidth="1.2" />
          <path d="M419 206L396 268Q395 271 390 271H265" stroke={outline} strokeOpacity=".24" strokeWidth="2" />
          {/* Sleek laptop emblem */}
          <g transform="translate(339 233) skewX(-16)" stroke="none">
            <circle cx="0" cy="1" r="11" fill="#ffffff" fillOpacity=".15" />
            <path d="M-6-3Q-2-5 0-2V5Q-2 2-6 4ZM1-2Q4-5 7-3V4Q4 2 1 5Z" fill="#f8fafc" fillOpacity=".75" />
          </g>
          <path d="M266 274H390" stroke={outline} strokeWidth="3" />
          <path d="M270 273.5H386" stroke={tint(laptopColor, '#ffffff', .35)} strokeWidth=".9" />
        </g>

        {/* Desk Plant */}
        {showPlant && <g className="character-plant">
          <ellipse cx="75" cy="286" rx="25" ry="4" fill={outline} fillOpacity=".09" stroke="none" />
          <g className="character-leaves">
            <path d="M73 247C69 227 67 215 66 202M73 246C80 233 90 224 100 221M72 244L49 231" stroke="#2d6a4f" />
            <path d="M71 239C55 226 54 205 64 189C81 199 87 219 76 240Z" fill={paint('leaf')} />
            <path d="M77 242C80 221 94 210 110 217C108 236 95 247 77 247Z" fill={paint('leaf')} />
            <path d="M71 241C57 219 40 217 32 230C41 244 55 249 73 247Z" fill="#40916c" />
            <path d="M66 203L73 241M99 223L79 242M43 232L66 242" stroke="#e7f1d9" strokeOpacity=".4" strokeWidth="1.3" />
          </g>
          <path d="M54 248H95L89 282Q75 287 61 282Z" fill={paint('paper')} />
          <path d="M85 250H94L89 281Q85 283 82 283Z" fill={outline} fillOpacity=".09" stroke="none" />
          <rect x="53" y="245" width="43" height="8" rx="2.5" fill={accentColor} />
          <path d="M58 261H92" stroke="#d4a359" strokeWidth="3.5" />
        </g>}

        {/* Desk Mug */}
        {showMug && <g className="character-mug">
          <ellipse cx="426" cy="249" rx="14" ry="2.6" fill={outline} fillOpacity=".1" stroke="none" />
          <path className="character-steam" d="M419 216Q422 210 419 205M427 215Q430 209 427 203" stroke="#ffffff" strokeOpacity=".6" strokeWidth="1.5" />
          <path d="M437 226H442C445 226 446 229 446 232C446 236 444 239 441 239H436" fill="none" strokeWidth="2.2" />
          <path d="M414 221H438L436 246Q426 249 416 246Z" fill={paint('paper')} />
          <ellipse cx="426" cy="221" rx="12" ry="3.2" fill={tint(accentColor, '#ffffff', .7)} />
          <ellipse cx="426" cy="221.5" rx="8.5" ry="1.8" fill="#6f4e37" stroke="none" />
          <path d="M417 232H435" stroke={shirtColor} strokeWidth="2.5" strokeOpacity=".75" />
        </g>}

        {/* Desk Books */}
        {showBooks && <g className="character-books">
          <g transform="translate(10 0)">
            <path d="M363 259L443 255V272L363 277Z" fill={paint('paper')} />
            <path d="M362 256L445 252V257L364 262Z" fill={paint('shirt')} />
            <path d="M365 276L444 272" stroke={shirtColor} strokeWidth="3.5" />
            <path d="M371 266L437 262M372 271L437 267" strokeOpacity=".13" strokeWidth=".9" />
            <path d="M357 280L438 276V290L357 294Z" fill={paint('paper')} />
            <path d="M356 278L440 274V278L358 283Z" fill="#d4a359" />
            <path d="M358 294L439 290" stroke="#b9944f" strokeWidth="3.5" />
            <path d="M366 287L432 282M366 291L432 286" strokeOpacity=".13" strokeWidth=".9" />
          </g>
          <g transform="translate(-7 47) scale(.83 .84)">
            <path d="M124 280Q158 266 198 282Q232 268 263 277L278 298Q237 290 198 306Q161 291 117 302Z" fill={paint('paper')} />
            <path d="M124 281Q159 272 195 283L198 301Q159 287 123 297Z" fill="white" fillOpacity=".18" stroke="none" />
            <path d="M202 283Q231 274 260 279L270 294Q238 286 201 301Z" fill="white" fillOpacity=".35" stroke="none" />
            <path d="M198 283V303" strokeOpacity=".25" strokeWidth="1.3" />
            <path d="M137 281Q159 277 182 284M135 286Q157 282 183 289M135 291Q154 288 175 293M213 284Q234 278 252 283M213 289Q237 284 255 288M213 294Q232 289 249 292" strokeOpacity=".2" strokeWidth="1" />
            <path d="M117 303Q159 293 198 307Q238 293 278 300" stroke={shirtColor} strokeWidth="3" />
            <path d="M248 292L252 306L258 301L261 304L257 291" fill="#d4a359" stroke="none" />
          </g>
        </g>}
      </g>
    </svg>
  );
}
