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
  bun: {
    shape: 'M159 117C147 96 150 71 161 57C178 37 216 37 236 53C253 67 253 95 242 118L231 82C216 88 190 83 175 94L168 120Z',
    strands: ['M160 82C170 60 188 49 204 49', 'M205 49C223 52 237 67 242 88', 'M178 82C193 75 216 76 229 71'],
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
    hairStyle, outfit, glasses, expression, facialHair, showBooks, showPlant, showBackdrop,
  } = settings;
  const id = useId().replace(/:/g, '');
  const paint = (name) => `url(#${id}-${name})`;
  const outline = '#304641';
  const hair = hairstyles[hairStyle];

  return (
    <svg viewBox="0 0 480 330" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={`${id}-skin`} x1="160" y1="65" x2="236" y2="178" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(skinColor, '#ffffff', .16)} /><stop offset=".55" stopColor={skinColor} /><stop offset="1" stopColor={tint(skinColor, '#714e3c', .16)} />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="172" y1="34" x2="231" y2="131" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(hairColor, '#ffffff', .12)} /><stop offset=".55" stopColor={hairColor} /><stop offset="1" stopColor={tint(hairColor, '#000000', .18)} />
        </linearGradient>
        <linearGradient id={`${id}-shirt`} x1="153" y1="186" x2="276" y2="268" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(shirtColor, '#ffffff', .14)} /><stop offset=".45" stopColor={shirtColor} /><stop offset="1" stopColor={tint(shirtColor, '#000000', .2)} />
        </linearGradient>
        <linearGradient id={`${id}-laptop`} x1="262" y1="212" x2="391" y2="280" gradientUnits="userSpaceOnUse">
          <stop stopColor={tint(laptopColor, '#ffffff', .22)} /><stop offset=".6" stopColor={laptopColor} /><stop offset="1" stopColor={tint(laptopColor, '#000000', .12)} />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={tint(accentColor, '#ffffff', .55)} /><stop offset="1" stopColor={accentColor} />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x1="49" y1="190" x2="91" y2="246" gradientUnits="userSpaceOnUse">
          <stop stopColor="#88b981" /><stop offset="1" stopColor="#397654" />
        </linearGradient>
      </defs>

      {showBackdrop && <g className="character-scene-details" stroke={accentColor} strokeLinecap="round" opacity=".5">
        <circle cx="349" cy="133" r="36" strokeOpacity=".4" />
        <circle cx="349" cy="133" r="26" strokeOpacity=".3" />
        <path d="M349 116V133L361 140" strokeWidth="2" />
        <path d="M111 121V133M105 127H117M306 67V77M301 72H311" strokeWidth="2" />
        <circle cx="103" cy="163" r="3" fill={accentColor} stroke="none" />
      </g>}

      <g stroke={outline} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="259" cy="300" rx="190" ry="8" fill={outline} fillOpacity=".09" stroke="none" />
        <path d="M55 295H446" strokeOpacity=".18" />

        <g className="character-head">
          {hairStyle === 'long' && <>
            <path d="M163 65C138 89 135 120 140 152C143 178 133 193 141 214C170 229 232 226 261 211C254 190 263 171 257 143C255 114 256 84 237 63Z" fill={paint('hair')} />
            <path d="M154 109C147 146 158 177 149 207M244 108C254 143 241 177 251 207" stroke={tint(hairColor, '#ffffff', .24)} strokeOpacity=".55" />
          </>}
          {hairStyle === 'bun' && <>
            <circle cx="225" cy="43" r="25" fill={paint('hair')} />
            <path d="M211 32C222 23 239 32 238 44M215 45C220 52 233 51 238 44" stroke={tint(hairColor, '#ffffff', .23)} strokeOpacity=".6" />
            <path d="M211 61L237 64" stroke={accentColor} strokeWidth="4" />
          </>}
        </g>

        <path d="M139 267C137 236 141 207 158 190C169 179 181 176 194 175H220C239 177 258 185 270 203C282 220 286 245 290 267Z" fill={paint('shirt')} />
        <path d="M145 222C143 241 146 254 147 266H170L161 223ZM272 221L286 267H267L260 230Z" fill={outline} fillOpacity=".1" stroke="none" />
        <path d="M164 190C171 185 179 182 187 181" stroke="white" strokeOpacity=".2" strokeWidth="3" />
        <path d="M178 146L179 177C183 194 219 199 228 179L226 146Z" fill={paint('skin')} />
        <path d="M179 151C188 170 215 176 226 155L226 166C216 181 191 179 179 166Z" fill={outline} fillOpacity=".13" stroke="none" />

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

        <g stroke={accentColor} strokeWidth="1.4" opacity=".8">
          <path d="M241 208V220Q247 225 253 220V208Z" />
          <path d="M244 213L247 212L250 213V218L247 217L244 218ZM247 212V217" strokeWidth="1" />
        </g>
        <path d="M146 205L132 228L162 242L177 216Z" fill={paint('shirt')} />
        <path d="M134 225L163 238" stroke={accentColor} strokeWidth="3" />
        <g className="character-hand character-hand-left">
          <path d="M134 229L159 239L158 253L216 254C224 250 232 248 239 251L254 262C259 267 253 274 246 274L148 275C131 274 126 258 131 241Z" fill={paint('skin')} />
          <path d="M138 259C139 266 144 269 152 269H205" stroke="white" strokeOpacity=".2" strokeWidth="3" />
          <path d="M222 255Q230 257 235 265M231 252Q240 256 244 263M240 254L249 261" strokeOpacity=".35" strokeWidth="1.3" />
          <path d="M218 265L228 268" strokeOpacity=".22" strokeWidth="1.2" />
        </g>
        <path d="M257 208L278 234L255 249L239 221Z" fill={paint('shirt')} />
        <path d="M257 243L276 232" stroke={accentColor} strokeWidth="3" />
        <g className="character-hand character-hand-right">
          <path d="M275 235L256 246L279 264H315C322 263 326 257 321 253L288 250Z" fill={paint('skin')} />
          <path d="M285 256H309M302 253L306 258M311 253L315 258" strokeOpacity=".28" strokeWidth="1.3" />
        </g>

        <g className="character-head">
          <ellipse cx="156" cy="116" rx="9" ry="13" fill={paint('skin')} />
          <ellipse cx="246" cy="116" rx="9" ry="13" fill={paint('skin')} />
          <path d="M155 111Q149 115 156 121M246 111Q252 115 246 121" strokeOpacity=".3" strokeWidth="1.4" />
          <path d="M159 94C158 68 174 49 200 49C229 47 247 69 245 96L242 128C239 152 223 173 202 176C180 174 164 154 161 129Z" fill={paint('skin')} />
          <path d="M165 98C164 78 175 62 187 59" stroke="white" strokeOpacity=".18" strokeWidth="5" />
          <path d="M239 111C239 142 224 164 205 168" stroke={outline} strokeOpacity=".08" strokeWidth="5" />
          <ellipse cx="176" cy="133" rx="9" ry="4" fill="#c96052" fillOpacity=".1" stroke="none" />
          <ellipse cx="230" cy="133" rx="9" ry="4" fill="#c96052" fillOpacity=".1" stroke="none" />

          {hair && <g>
            <path d={hair.shape} fill={paint('hair')} />
            <g stroke={tint(hairColor, '#ffffff', .28)} strokeOpacity=".45" strokeWidth="2.3">
              {hair.strands.map((strand) => <path key={strand} d={strand} />)}
            </g>
          </g>}
          <path d="M173 102Q182 97 191 102M212 102Q222 97 231 103" stroke={hairColor} strokeWidth="3" />
          <g className="character-eyes">
            <path d="M173 115Q183 107 194 115Q184 123 173 115Z" fill="#fffdf8" strokeWidth="1.2" />
            <ellipse cx="184" cy="115" rx="4.6" ry="5.1" fill={eyeColor} stroke="none" />
            <ellipse cx="184.6" cy="115.5" rx="2.1" ry="3.1" fill={outline} stroke="none" />
            <circle cx="182.7" cy="112.8" r="1.5" fill="white" stroke="none" />
            <circle cx="186.2" cy="117.5" r=".65" fill="white" fillOpacity=".65" stroke="none" />
            {expression === 'wink' ? <path d="M212 115Q222 108 232 115" strokeWidth="2.5" /> : <>
              <path d="M212 115Q222 107 233 115Q222 123 212 115Z" fill="#fffdf8" strokeWidth="1.2" />
              <ellipse cx="222" cy="115" rx="4.6" ry="5.1" fill={eyeColor} stroke="none" />
              <ellipse cx="222.6" cy="115.5" rx="2.1" ry="3.1" fill={outline} stroke="none" />
              <circle cx="220.7" cy="112.8" r="1.5" fill="white" stroke="none" />
              <circle cx="224.2" cy="117.5" r=".65" fill="white" fillOpacity=".65" stroke="none" />
            </>}
          </g>
          <path d="M203 118L199 130Q202 134 208 131" strokeOpacity=".35" strokeWidth="1.4" />
          {facialHair !== 'none' && <path d="M170 135Q181 146 192 143L202 140L214 144Q228 145 236 135C232 157 219 173 202 176C184 172 174 157 170 135Z" fill={paint('hair')} opacity={facialHair === 'stubble' ? '.24' : '.92'} stroke="none" />}
          {expression === 'neutral' ? <>
            <path d="M191 145Q202 149 214 145" strokeWidth="1.8" />
            <path d="M198 153H207" stroke="#fff5e7" strokeOpacity=".25" />
          </> : <>
            <path d="M184 140Q202 150 222 139C217 154 209 159 200 158C193 157 187 150 184 140Z" fill="#824b43" strokeWidth="1.2" />
            <path d="M188 143Q203 150 218 142L215 148Q202 153 191 147Z" fill="#fffdf5" stroke="none" />
            <path d="M197 156Q203 152 209 155" stroke="#d8897c" strokeWidth="1.5" />
          </>}
          {glasses !== 'none' && <g stroke={tint(hairColor, '#304641', .5)} strokeWidth="2.2">
            {glasses === 'round' ? <>
              <circle cx="183" cy="115" r="14.5" fill="white" fillOpacity=".07" />
              <circle cx="222" cy="115" r="14.5" fill="white" fillOpacity=".07" />
            </> : <>
              <rect x="167" y="102" width="32" height="25" rx="6" fill="white" fillOpacity=".07" />
              <rect x="206" y="102" width="32" height="25" rx="6" fill="white" fillOpacity=".07" />
            </>}
            <path d="M198 113Q202 109 207 113M168 110L159 107M238 110L245 107" />
            <path d="M175 107L172 112M214 107L211 112" stroke="white" strokeOpacity=".5" strokeWidth="1.6" />
          </g>}
        </g>

        <g>
          <path d="M263 212H402C408 212 411 216 409 222L395 271H247Z" fill={paint('laptop')} />
          <path d="M270 219H399L387 262H258Z" stroke="white" strokeOpacity=".16" strokeWidth="1" />
          <path d="M263 215L250 267" stroke="white" strokeOpacity=".3" strokeWidth="1.5" />
          <circle className="character-laptop-light" cx="330" cy="242" r="6.5" fill="#f3f8f5" fillOpacity=".65" stroke="none" />
          <path d="M246 271H395L409 278Q412 282 403 282H237Q232 281 237 277Z" fill={tint(laptopColor, '#ffffff', .22)} />
          <path d="M284 272H347L351 276H281Z" fill={outline} fillOpacity=".16" stroke="none" />
          <path d="M240 278H403" stroke="white" strokeOpacity=".25" />
        </g>

        {showPlant && <g className="character-plant">
          <ellipse cx="75" cy="286" rx="25" ry="4" fill={outline} fillOpacity=".09" stroke="none" />
          <g className="character-leaves">
            <path d="M73 247C69 227 67 215 66 202M73 246C80 233 90 224 100 221M72 244L49 231" stroke="#427957" />
            <path d="M71 239C55 226 54 205 64 189C81 199 87 219 76 240Z" fill={paint('leaf')} />
            <path d="M77 242C80 221 94 210 110 217C108 236 95 247 77 247Z" fill={paint('leaf')} />
            <path d="M71 241C57 219 40 217 32 230C41 244 55 249 73 247Z" fill="#5c9969" />
            <path d="M66 203L73 241M99 223L79 242M43 232L66 242" stroke="#e7f1d9" strokeOpacity=".35" strokeWidth="1.3" />
          </g>
          <path d="M54 248H95L89 282Q75 287 61 282Z" fill={paint('paper')} />
          <path d="M85 250H94L89 281Q85 283 82 283Z" fill={outline} fillOpacity=".09" stroke="none" />
          <rect x="53" y="245" width="43" height="8" rx="2.5" fill={accentColor} />
          <path d="M58 261H92" stroke="#c6a45e" strokeWidth="3.5" />
        </g>}

        {showBooks && <g className="character-books">
          <path d="M363 259L443 255V272L363 277Z" fill={paint('paper')} />
          <path d="M362 256L445 252V257L364 262Z" fill={paint('shirt')} />
          <path d="M365 276L444 272" stroke={shirtColor} strokeWidth="3.5" />
          <path d="M371 266L437 262M372 271L437 267" strokeOpacity=".13" strokeWidth=".9" />
          <path d="M357 280L438 276V290L357 294Z" fill={paint('paper')} />
          <path d="M356 278L440 274V278L358 283Z" fill="#c6a45e" />
          <path d="M358 294L439 290" stroke="#b9944f" strokeWidth="3.5" />
          <path d="M366 287L432 282M366 291L432 286" strokeOpacity=".13" strokeWidth=".9" />
          <path d="M124 280Q158 266 198 282Q232 268 263 277L278 298Q237 290 198 306Q161 291 117 302Z" fill={paint('paper')} />
          <path d="M124 281Q159 272 195 283L198 301Q159 287 123 297Z" fill="white" fillOpacity=".18" stroke="none" />
          <path d="M202 283Q231 274 260 279L270 294Q238 286 201 301Z" fill="white" fillOpacity=".35" stroke="none" />
          <path d="M198 283V303" strokeOpacity=".25" strokeWidth="1.3" />
          <path d="M137 281Q159 277 182 284M135 286Q157 282 183 289M135 291Q154 288 175 293M213 284Q234 278 252 283M213 289Q237 284 255 288M213 294Q232 289 249 292" strokeOpacity=".2" strokeWidth="1" />
          <path d="M117 303Q159 293 198 307Q238 293 278 300" stroke={shirtColor} strokeWidth="3" />
          <path d="M248 292L252 306L258 301L261 304L257 291" fill="#c6a45e" stroke="none" />
        </g>}
      </g>
    </svg>
  );
}
