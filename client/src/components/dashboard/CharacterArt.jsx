import React, { useId } from 'react';

const hairstyles = {
  swept: {
    shape: 'M157 114C147 101 146 82 153 66C158 54 169 48 181 47C191 32 211 30 225 39C242 35 258 48 256 66C258 85 250 103 242 114L237 84C222 98 201 88 181 98C173 103 168 111 166 121Z',
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
  const paint = name => 'url(#' + id + '-' + name + ')';
  const definition = name => id + '-' + name;
  const outline = '#34465b';
  const hair = hairstyles[hairStyle];
  const hairLight = tint(hairColor, '#ffffff', .22);
  const skinShadow = tint(skinColor, '#784a3a', .24);
  const paper = tint(accentColor, '#ffffff', .7);

  return <svg viewBox="0 0 480 330" fill="none" xmlns="http://www.w3.org/2000/svg" data-character-style={isFemale ? 'female' : 'male'} data-character-design="campus-v2" {...props}>
    <defs>
      <linearGradient id={definition('skin')} x1="170" y1="75" x2="234" y2="176" gradientUnits="userSpaceOnUse">
        <stop stopColor={tint(skinColor, '#fff7ed', .22)} /><stop offset=".52" stopColor={skinColor} /><stop offset="1" stopColor={skinShadow} />
      </linearGradient>
      <linearGradient id={definition('hair')} x1="170" y1="40" x2="231" y2="148" gradientUnits="userSpaceOnUse">
        <stop stopColor={tint(hairColor, '#ffffff', .13)} /><stop offset=".55" stopColor={hairColor} /><stop offset="1" stopColor={tint(hairColor, '#0f172a', .28)} />
      </linearGradient>
      <linearGradient id={definition('shirt')} x1="155" y1="191" x2="280" y2="282" gradientUnits="userSpaceOnUse">
        <stop stopColor={tint(shirtColor, '#ffffff', .16)} /><stop offset=".48" stopColor={shirtColor} /><stop offset="1" stopColor={tint(shirtColor, '#0f172a', .23)} />
      </linearGradient>
      <linearGradient id={definition('laptop')} x1="289" y1="204" x2="397" y2="284" gradientUnits="userSpaceOnUse">
        <stop stopColor={tint(laptopColor, '#ffffff', .28)} /><stop offset=".6" stopColor={laptopColor} /><stop offset="1" stopColor={tint(laptopColor, '#0f172a', .22)} />
      </linearGradient>
      <linearGradient id={definition('laptop-deck')} x1="244" y1="252" x2="298" y2="289" gradientUnits="userSpaceOnUse">
        <stop stopColor={tint(laptopColor, '#ffffff', .6)} /><stop offset="1" stopColor={tint(laptopColor, '#ffffff', .3)} />
      </linearGradient>
      <linearGradient id={definition('paper')} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#fffdf8" /><stop offset="1" stopColor={tint(accentColor, '#f4e6cf', .65)} />
      </linearGradient>
      <linearGradient id={definition('leaf')} x1="45" y1="209" x2="96" y2="267" gradientUnits="userSpaceOnUse">
        <stop stopColor="#93d3a1" /><stop offset=".5" stopColor="#4e9b78" /><stop offset="1" stopColor="#28765e" />
      </linearGradient>
    </defs>

    {showBackdrop && <g className="character-scene-details" strokeLinecap="round" strokeLinejoin="round">
      <rect x="84" y="112" width="50" height="39" rx="11" fill="white" fillOpacity=".76" transform="rotate(-9 109 131)" />
      <path d="M100 125H119V138H100ZM105 143H115M110 138V143" stroke={shirtColor} strokeOpacity=".7" strokeWidth="1.7" />
      <circle cx="366" cy="113" r="31" fill="white" fillOpacity=".35" stroke="white" strokeOpacity=".7" />
      <circle cx="366" cy="113" r="24" stroke={shirtColor} strokeOpacity=".18" />
      <path d="M366 99V114L376 120" stroke={shirtColor} strokeOpacity=".55" strokeWidth="2" />
      <path d="M305 62V72M300 67H310M104 184V192M100 188H108" stroke={accentColor} strokeWidth="2.5" />
      <circle cx="399" cy="165" r="3" fill={accentColor} />
      <circle cx="127" cy="77" r="3" fill="white" fillOpacity=".65" />
      <path d="M326 160H345" stroke="white" strokeOpacity=".45" strokeWidth="3" />
    </g>}

    <g stroke={outline} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="253" cy="303" rx="202" ry="10" fill="#183b58" fillOpacity=".08" stroke="none" />
      <path d="M43 293H457L449 301H53Z" fill="white" fillOpacity=".3" stroke="none" />
      <path d="M53 301H449" stroke={shirtColor} strokeOpacity=".16" />
      <g className="character-person">
        <path d="M148 276V215C148 201 161 191 176 191H231C247 191 260 203 260 218V278Z" fill={tint(shirtColor, '#17243a', .5)} stroke="none" />

        <g className="character-head">
        {hairStyle === 'long' && <>
          <path d="M161 67C140 88 139 118 141 148C142 176 132 201 141 224C175 237 230 234 260 220C250 193 262 174 255 143C256 111 252 80 236 64Z" fill={paint('hair')} />
          <path d="M151 110C144 151 156 185 148 217M245 111C253 151 242 184 251 215" stroke={hairLight} strokeOpacity=".45" />
        </>}
        {hairStyle === 'bob' && <>
          <path d="M156 72C138 94 137 132 144 158C151 175 166 179 179 173L231 173C246 179 256 170 260 154C264 123 257 86 239 67Z" fill={paint('hair')} />
          <path d="M148 113Q144 142 154 163M251 111Q258 140 245 163" stroke={hairLight} strokeOpacity=".4" />
        </>}
        {hairStyle === 'bun' && <>
          <circle cx="226" cy="43" r="23" fill={paint('hair')} />
          <path d="M213 35Q226 23 239 39M216 47Q230 56 239 43" stroke={hairLight} strokeOpacity=".5" />
          <path d="M211 61L238 64" stroke={accentColor} strokeWidth="4" />
        </>}
        {hairStyle === 'ponytail' && <>
          <path d="M238 71C264 66 279 91 273 121C268 148 281 169 267 191C253 182 247 165 251 144C254 119 246 99 234 86Z" fill={paint('hair')} />
          <path d="M254 94C267 119 257 153 264 175" stroke={hairLight} strokeOpacity=".45" />
          <circle cx="241" cy="77" r="5" fill={accentColor} />
        </>}
      </g>

      <path d="M135 278C134 246 139 221 153 204C167 190 182 188 198 188H215C236 189 256 198 269 217C281 236 283 257 285 279Z" fill={paint('shirt')} />
      <path d="M143 238Q143 261 147 279H166L160 236M266 234L279 278H262L255 241" fill="#102440" fillOpacity=".13" stroke="none" />
      <path d="M155 211Q165 201 180 197" stroke="white" strokeOpacity=".2" strokeWidth="3" />
      <path d={isFemale ? 'M184 158V188Q201 209 222 189L222 157Z' : 'M179 156L181 187Q201 211 226 189L225 157Z'} fill={paint('skin')} />
      <path d="M183 163Q202 181 222 163V175Q201 189 183 175Z" fill={skinShadow} stroke="none" fillOpacity=".6" />

      {outfit === 'polo' && <>
        <path d="M180 186L201 200L187 215L165 197Z" fill={paper} />
        <path d="M225 186L201 200L216 215L240 198Z" fill={paper} />
        <path d="M201 201V256" stroke={accentColor} strokeWidth="2" />
        <circle cx="207" cy="222" r="1.7" fill={accentColor} stroke="none" />
        <circle cx="207" cy="239" r="1.7" fill={accentColor} stroke="none" />
      </>}
      {outfit === 'tshirt' && <>
        <path d="M178 187Q202 215 227 187L237 193Q204 228 168 194Z" fill={accentColor} />
        <path d="M180 191Q202 212 225 192" stroke={outline} strokeOpacity=".2" />
      </>}
      {outfit === 'hoodie' && <>
        <path d="M177 186L160 201L182 220L202 204L221 221L244 202L228 186Q204 214 177 186Z" fill={tint(shirtColor, '#ffffff', .3)} />
        <path d="M173 195L183 214L202 204L221 214L233 196" stroke={accentColor} strokeOpacity=".6" />
        <path d="M185 219L181 249M220 219L224 248" stroke={accentColor} strokeWidth="2.5" />
        <path d="M181 245V251M224 244V250" strokeWidth="2.5" />
        <path d="M179 269Q202 256 230 268" stroke={accentColor} strokeOpacity=".5" />
      </>}
      {outfit === 'sweater' && <>
        <path d="M176 186Q201 213 229 186L236 193Q203 227 169 194Z" fill={accentColor} />
        <path d="M180 193L177 200M191 199L189 207M204 202V211M217 198L220 206M228 192L232 200" stroke={shirtColor} strokeOpacity=".4" strokeWidth="1.2" />
        <path d="M170 231Q205 242 252 230" stroke="white" strokeOpacity=".13" strokeWidth="2" />
      </>}
      {outfit === 'blazer' && <>
        <path d="M179 187L202 256L227 187Q204 207 179 187Z" fill={paper} />
        <path d="M199 201L203 247L208 201Z" fill={tint(shirtColor, '#17243a', .55)} stroke="none" />
        <path d="M175 188L161 206L179 222L174 232L200 260L182 191ZM231 188L246 207L228 223L233 232L206 260L223 191Z" fill={tint(shirtColor, '#17243a', .16)} />
      </>}
      <path d="M242 220V231Q248 236 254 231V220Z" fill={accentColor} fillOpacity=".13" stroke={accentColor} strokeWidth="1.2" />
      <path d="M245 224Q248 222 248 225Q250 222 252 224V229Q250 227 248 230Q246 227 245 229Z" stroke={accentColor} strokeWidth=".9" />
      <path d="M149 211L131 237L161 249L178 224Z" fill={paint('shirt')} />
      <path d="M134 235L162 246" stroke={accentColor} strokeWidth="3.5" />
      <path d="M254 213L276 236L256 250L238 226Z" fill={paint('shirt')} />
      <path d="M258 246L274 235" stroke={accentColor} strokeWidth="3" />
      </g>

      <g className="character-laptop-base">
        <ellipse cx="314" cy="290" rx="96" ry="5" fill="#152d46" fillOpacity=".13" stroke="none" />
        <path d="M220 256H358L408 284H270Z" fill={paint('laptop-deck')} />
        <g className="character-laptop-keyboard" transform="matrix(1 0 1.4 .78 220 256)" stroke="none">
          <rect x="8" y="16" width="122" height="17" rx="2" fill={outline} fillOpacity=".16" />
          {[0, 1, 2, 3].map(row => <g key={row} fill={tint(laptopColor, '#10243a', .42)}>
            {Array.from({ length: 12 }, (_, column) => <rect key={column} x={11 + column * 9.8} y={18 + row * 3.3} width="7.5" height="2" rx=".6" />)}
          </g>)}
          <rect x="53" y="4" width="35" height="8" rx="1.7" fill={laptopColor} fillOpacity=".18" stroke={outline} strokeOpacity=".28" strokeWidth=".7" />
        </g>
        <path d="M220 256V260L270 288H408V284H270Z" fill={tint(laptopColor, '#17243a', .25)} />
        <path d="M273 286H403" stroke="white" strokeOpacity=".23" strokeWidth=".8" />
        <circle className="character-laptop-light" cx="259" cy="280" r="1.2" fill="#a5f3e7" stroke="none" />
      </g>
      <g className="character-person">
      <g className="character-hand character-hand-left">
        <path d="M135 238L160 247L156 260L216 261C222 256 230 256 237 260L251 270Q257 277 249 277L226 270L155 282C138 286 127 273 131 257Z" fill={paint('skin')} />
        <path d="M137 266Q140 277 152 277L208 268" stroke={tint(skinColor, '#fffaf2', .45)} strokeWidth="2.5" />
        <path d="M221 263L235 271M230 261L243 272M239 265L250 273" stroke={skinShadow} strokeWidth="1.1" />
      </g>
      <g className="character-hand character-hand-right">
        <path d="M274 237L256 249L279 267L305 270Q316 269 313 262L285 252Z" fill={paint('skin')} />
        <path d="M282 260L305 267M298 261L306 267" stroke={skinShadow} strokeWidth="1.1" />
      </g>

      <g className="character-head">
        <ellipse cx="157" cy="123" rx="8" ry="12" fill={paint('skin')} />
        <ellipse cx="246" cy="123" rx="8" ry="12" fill={paint('skin')} />
        <path d="M156 119Q151 123 157 128M246 119Q251 124 245 128" stroke={skinShadow} />
        <path className="character-face" d={isFemale ? 'M159 95C158 70 176 53 200 53C226 51 246 71 245 96L242 131C239 153 224 172 202 178C181 174 165 155 162 133Z' : 'M158 95C158 70 175 53 200 53C227 51 247 71 246 96L243 132C239 156 224 177 202 180C179 177 164 157 161 133Z'} fill={paint('skin')} />
        <path d="M165 104C163 83 174 66 185 62" stroke="white" strokeOpacity=".2" strokeWidth="4" />
        <path d="M240 118Q237 157 211 169" stroke={skinShadow} strokeOpacity=".38" strokeWidth="3.5" />
        <ellipse cx="176" cy="140" rx="10" ry="5" fill="#c96e62" fillOpacity=".13" stroke="none" />
        <ellipse cx="229" cy="140" rx="10" ry="5" fill="#c96e62" fillOpacity=".13" stroke="none" />
        {hair && <g>
          <path d={hair.shape} fill={paint('hair')} stroke={tint(hairColor, '#17243a', .3)} />
          <g stroke={hairLight} strokeOpacity=".45" strokeWidth="1.8">{hair.strands.map(strand => <path key={strand} d={strand} />)}</g>
        </g>}
        <path d={expression === 'focused' ? 'M174 110L193 113M213 113L232 110' : 'M174 108Q183 102 193 108M213 108Q222 102 232 109'} stroke={hairColor} strokeWidth={isFemale ? 2 : 2.6} />
        <g className={expression === 'happy' ? 'character-eyes character-eyes--happy' : 'character-eyes'}>
          {expression === 'happy' ? <path d="M174 122Q183 113 194 122M213 122Q223 113 232 122" strokeWidth="2.5" /> : <>
            <path d="M174 121Q183 113 194 121Q184 129 174 121Z" fill="#fffef9" strokeWidth="1.1" />
            <ellipse cx="185" cy="122" rx="4.5" ry="5" fill={eyeColor} stroke="none" />
            <ellipse cx="186" cy="122.5" rx="2" ry="3" fill="#17243a" stroke="none" />
            <circle cx="183.5" cy="119.5" r="1.4" fill="white" stroke="none" />
            {expression === 'wink' ? <path d="M213 122Q222 114 232 122" strokeWidth="2.5" /> : <>
              <path d="M213 121Q222 113 233 121Q223 129 213 121Z" fill="#fffef9" strokeWidth="1.1" />
              <ellipse cx="224" cy="122" rx="4.5" ry="5" fill={eyeColor} stroke="none" />
              <ellipse cx="225" cy="122.5" rx="2" ry="3" fill="#17243a" stroke="none" />
              <circle cx="222.5" cy="119.5" r="1.4" fill="white" stroke="none" />
            </>}
            {isFemale && <path d="M175 119L173 116M232 119L234 116" strokeWidth="1.4" />}
          </>}
        </g>
        <path d="M203 124L200 136Q203 139 208 136" stroke={skinShadow} strokeWidth="1.3" />
        {facialHair !== 'none' && <path d="M168 140Q182 150 194 146L202 144L213 148Q227 150 238 140C233 160 219 178 202 180C184 177 173 160 168 140Z" fill={paint('hair')} fillOpacity={facialHair === 'stubble' ? '.23' : '.93'} stroke="none" />}
        {['neutral', 'focused'].includes(expression)
          ? <path d={expression === 'focused' ? 'M193 152Q202 149 213 151' : 'M191 151Q202 155 215 150'} strokeWidth="1.8" />
          : <>
            <path d={expression === 'happy' ? 'M184 145Q202 156 221 144Q216 164 202 164Q190 162 184 145Z' : 'M187 146Q202 155 218 145Q214 161 202 161Q193 160 187 146Z'} fill="#92584e" stroke={tint(skinShadow, '#703f3a', .5)} strokeWidth="1" />
            <path d="M190 149Q203 156 216 148L213 153Q202 158 192 153Z" fill="#fffdf5" stroke="none" />
          </>}
        {glasses !== 'none' && <g stroke={tint(hairColor, outline, .55)} strokeWidth="2">
          {glasses === 'round' ? <>
            <circle cx="184" cy="122" r="14" fill="white" fillOpacity=".1" />
            <circle cx="223" cy="122" r="14" fill="white" fillOpacity=".1" />
          </> : <>
            <rect x="168" y="109" width="32" height="26" rx={glasses === 'square' ? 6 : 9} fill="white" fillOpacity=".1" />
            <rect x="207" y="109" width="32" height="26" rx={glasses === 'square' ? 6 : 9} fill="white" fillOpacity=".1" />
            {glasses === 'browline' && <path d="M168 115Q184 108 200 115M207 115Q223 108 239 115" strokeWidth="3.5" />}
          </>}
          <path d="M199 121Q203 117 208 121M169 117L160 114M239 117L246 114" />
          <path d="M175 114L172 119M214 114L211 119" stroke="white" strokeOpacity=".65" strokeWidth="1.5" />
        </g>}
        {showHeadphones && <g className="character-headphones">
          <path d="M152 114C149 71 170 44 202 44C235 44 255 71 251 114" stroke={tint(laptopColor, '#17243a', .35)} strokeWidth="6" />
          <path d="M154 107C154 70 174 47 202 47C230 47 251 71 249 107" stroke={accentColor} strokeOpacity=".55" strokeWidth="1.5" />
          <rect x="145" y="108" width="13" height="29" rx="6.5" fill={laptopColor} />
          <rect x="246" y="108" width="13" height="29" rx="6.5" fill={laptopColor} />
          <path d="M151 115V130M252 115V130" stroke={accentColor} strokeWidth="3" strokeOpacity=".75" />
        </g>}
      </g>
      </g>

      <g className="character-laptop-lid">
        <path d="M292 202H421Q428 202 426 209L408 279Q407 284 402 284H274Q267 284 269 277L286 208Q287 202 292 202Z" fill={paint('laptop')} />
        <path d="M292 205H420Q424 205 423 210M289 210L273 276" stroke="white" strokeOpacity=".4" strokeWidth="1.2" />
        <path d="M426 210L407 279Q406 282 402 282H275" stroke={tint(laptopColor, '#17243a', .35)} strokeWidth="2" />
        <g transform="translate(346 243) skewX(-14)" stroke="none">
          <circle r="13" fill="white" fillOpacity=".12" />
          <path d="M-7-4Q-3-6 0-3Q4-6 8-4V5Q4 3 0 6Q-3 3-7 5Z" fill="#f8fafc" fillOpacity=".8" />
          <path d="M0-2V5" stroke={laptopColor} strokeWidth="1.1" />
        </g>
        <path d="M274 284H402" stroke={tint(laptopColor, '#17243a', .5)} strokeWidth="2.7" />
      </g>

      {showPlant && <g className="character-plant">
        <ellipse cx="76" cy="295" rx="25" ry="4" fill="#183b58" fillOpacity=".08" stroke="none" />
        <g className="character-leaves">
          <path d="M75 265L67 224M75 266L96 243M75 265L48 248" stroke="#3d7e60" strokeWidth="2" />
          <path d="M72 260C56 247 54 224 65 210C81 221 86 241 76 261Z" fill={paint('leaf')} />
          <path d="M77 264C79 242 98 229 112 239C107 257 94 266 77 267Z" fill={paint('leaf')} />
          <path d="M72 265C56 244 38 240 32 254C44 266 58 270 73 268Z" fill="#5ba587" />
          <path d="M66 224L73 258M98 243L81 261M44 254L65 264" stroke="#e5f3dc" strokeOpacity=".55" strokeWidth="1.1" />
        </g>
        <path d="M55 268H97L91 291Q76 297 61 291Z" fill={paint('paper')} />
        <path d="M87 271H96L91 291L85 293Z" fill="#baa78b" fillOpacity=".15" stroke="none" />
        <rect x="54" y="265" width="44" height="7" rx="2.5" fill={accentColor} />
        <path d="M60 280H93" stroke={shirtColor} strokeOpacity=".4" strokeWidth="3" />
      </g>}
      {showMug && <g className="character-mug" transform={showBooks ? undefined : 'translate(0 28)'}>
        <path className="character-steam" d="M431 231Q427 226 431 221M439 230Q435 223 439 217" stroke="white" strokeOpacity=".75" strokeWidth="1.6" />
        <path d="M447 244H452Q460 244 458 252Q457 259 448 258" strokeWidth="2.2" />
        <path d="M422 240H447L445 264Q434 269 424 264Z" fill={paper} />
        <ellipse cx="434.5" cy="240" rx="12.5" ry="3" fill={tint(accentColor, '#ffffff', .6)} />
        <ellipse cx="434.5" cy="240.5" rx="8.7" ry="1.5" fill="#87654e" stroke="none" />
        <path d="M426 252H443" stroke={shirtColor} strokeOpacity=".55" strokeWidth="2.8" />
      </g>}
      {showBooks && <g className="character-books">
        <path d="M389 274L453 269V282L389 287Z" fill={paint('paper')} />
        <path d="M387 271L455 266V270L390 275Z" fill={shirtColor} />
        <path d="M390 286L454 281" stroke={shirtColor} strokeWidth="3" />
        <path d="M385 289L449 285V298L385 301Z" fill={paint('paper')} />
        <path d="M383 287L451 282V286L386 291Z" fill="#d6b474" />
        <path d="M386 301L450 297" stroke="#c49a58" strokeWidth="3" />
        <path d="M395 279L446 275M394 295L443 291" stroke="#b3a489" strokeOpacity=".5" strokeWidth=".8" />
        <path d="M120 294Q151 283 183 297Q218 284 243 294L254 315Q218 306 184 318Q151 306 111 316Z" fill={paint('paper')} />
        <path d="M183 298L184 316" stroke="#c0ac8d" strokeWidth="1" />
        <path d="M131 295Q150 290 173 299M128 301Q151 296 174 305M196 299Q215 291 236 297M196 305Q215 298 239 303" stroke="#a59c8c" strokeOpacity=".55" strokeWidth="1" />
        <path d="M111 316Q151 308 184 320Q218 308 254 315" stroke={shirtColor} strokeWidth="3" />
        <path d="M224 308L228 321L233 316L237 319L233 307Z" fill="#d6b474" stroke="none" />
      </g>}
    </g>
  </svg>;
}
