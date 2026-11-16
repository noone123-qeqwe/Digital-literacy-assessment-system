import React from 'react';

export default function CharacterArt({ settings, ...props }) {
  const {
    skinColor, hairColor, eyeColor, shirtColor, accentColor, laptopColor,
    hairStyle, outfit, glasses, expression, facialHair, showBooks, showPlant,
  } = settings;
  const outline = '#293e35';

  return (
    <svg viewBox="0 0 480 330" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke={outline} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M85 293H440" strokeOpacity=".15" strokeWidth="10" />
        <g className="character-head">
          {hairStyle === 'long' && <path d="M159 75C130 118 128 170 141 214C170 229 226 228 257 207C267 169 257 112 240 75Z" fill={hairColor} />}
          {hairStyle === 'bun' && <circle cx="223" cy="43" r="29" fill={hairColor} />}
        </g>

        <path d="M140 265C137 220 149 190 176 179L196 172H222L242 179C272 188 287 220 290 265Z" fill={shirtColor} />
        <path d="M150 213L168 220L163 267H137C135 245 140 224 150 213Z" fill={accentColor} stroke="none" opacity=".5" />
        <path d="M178 145L178 180C186 193 214 197 226 180L224 144Z" fill={skinColor} />
        <path d="M179 151C188 164 213 170 224 151V162C212 178 190 174 179 166Z" fill={outline} opacity=".12" stroke="none" />

        {outfit === 'polo' && <>
          <path d="M174 177L201 195L187 209L163 183Z" fill={accentColor} />
          <path d="M227 177L201 195L215 208L238 184Z" fill={accentColor} />
          <path d="M201 196V244" stroke={accentColor} />
          <circle cx="207" cy="214" r="2" fill={accentColor} stroke="none" />
          <circle cx="207" cy="229" r="2" fill={accentColor} stroke="none" />
        </>}
        {outfit === 'tshirt' && <path d="M174 177C180 199 218 202 230 177L237 182C226 213 175 214 165 183Z" fill={accentColor} />}
        {outfit === 'hoodie' && <>
          <path d="M170 176L154 190L184 216L202 194L220 216L247 190L232 176C225 200 181 203 170 176Z" fill={accentColor} />
          <path d="M184 213L180 243M221 213L226 241" stroke={accentColor} strokeWidth="4" />
          <path d="M185 253Q204 242 229 253" stroke={accentColor} />
        </>}
        <path d="M146 206L133 229L164 244L177 216Z" fill={shirtColor} />
        <g className="character-hand character-hand-left">
          <path d="M135 226L160 236L159 254L217 254C228 250 236 247 243 252L257 263L249 273L147 274C131 272 126 256 135 226Z" fill={skinColor} />
          <path d="M143 266L206 267M223 255L233 265M232 252L242 262" strokeOpacity=".35" />
        </g>
        <path d="M257 211L277 236L255 250L239 222Z" fill={shirtColor} />
        <g className="character-hand character-hand-right">
          <path d="M274 234L255 246L279 264L316 264L322 253L287 250Z" fill={skinColor} />
        </g>

        <g className="character-head">
        <ellipse cx="161" cy="117" rx="9" ry="15" fill={skinColor} />
        <ellipse cx="242" cy="117" rx="9" ry="15" fill={skinColor} />
        <path d="M163 113C159 94 161 63 181 54C199 45 227 50 239 71L240 122C236 150 221 169 202 171C180 168 166 145 163 113Z" fill={skinColor} />
        <path d="M172 111C170 94 172 75 186 64" stroke="white" strokeOpacity=".2" strokeWidth="7" />
        <path d="M162 114L163 123M243 115L241 124" strokeOpacity=".3" />

        {hairStyle === 'swept' && <path d="M161 111L154 86L159 67L148 59L174 54L167 38L194 42C226 18 254 43 250 69L259 77L242 99L231 72C212 88 185 78 174 92L168 116Z" fill={hairColor} />}
        {hairStyle === 'short' && <path d="M160 111C145 81 151 50 180 44C210 32 244 47 248 76L241 112L229 79L180 82L169 112Z" fill={hairColor} />}
        {hairStyle === 'curly' && <path d="M160 111L150 93C133 87 140 70 150 68C139 49 158 39 170 44C167 24 190 20 200 32C213 14 237 26 234 40C257 33 268 53 255 65C272 78 261 96 245 97L240 111L231 77C217 87 190 87 173 81L167 113Z" fill={hairColor} />}
        {hairStyle === 'long' && <path d="M161 117C142 79 156 43 194 41C227 33 252 54 251 87L240 121L230 77C217 92 187 99 175 104L171 123Z" fill={hairColor} />}
        {hairStyle === 'bun' && <path d="M161 117C143 90 153 51 182 46C216 33 247 53 249 83L240 117L228 79C212 86 187 83 174 88L170 118Z" fill={hairColor} />}
        {hairStyle === 'buzz' && <path d="M162 97C154 69 173 47 200 47C226 46 245 67 241 97L234 84C211 76 184 76 168 86Z" fill={hairColor} />}
        {hairStyle !== 'none' && hairStyle !== 'buzz' && <path d="M173 63C188 48 213 47 229 59" stroke="white" strokeOpacity=".12" strokeWidth="5" />}

        <path d="M178 102Q185 97 193 102M213 102Q221 97 229 103" stroke={hairColor} strokeWidth="3.5" />
        <g className="character-eyes">
        <path d="M177 115Q186 108 195 115Q185 121 177 115Z" fill="white" strokeWidth="1.5" />
        <ellipse cx="187" cy="114" rx="3.5" ry="4.5" fill={eyeColor} stroke="none" />
        <circle cx="188" cy="112.5" r="1.2" fill="white" stroke="none" />
        {expression === 'wink'
          ? <path d="M213 115Q222 109 229 115" strokeWidth="3" />
          : <>
            <path d="M212 115Q221 108 231 115Q221 121 212 115Z" fill="white" strokeWidth="1.5" />
            <ellipse cx="221" cy="114" rx="3.5" ry="4.5" fill={eyeColor} stroke="none" />
            <circle cx="222" cy="112.5" r="1.2" fill="white" stroke="none" />
          </>}
        </g>
        <path d="M204 117L201 129L207 131" strokeOpacity=".45" strokeWidth="1.7" />
        {facialHair !== 'none' && <path d="M173 134Q181 146 192 143L202 138L214 143Q227 145 236 134C232 157 218 170 202 171C186 168 176 155 173 134Z" fill={hairColor} opacity={facialHair === 'stubble' ? '.3' : '1'} stroke="none" />}
        {expression === 'neutral'
          ? <path d="M192 145Q202 148 213 145" strokeWidth="2" />
          : <>
            <path d="M187 139Q203 148 220 137C215 156 196 160 187 139Z" fill="#8c443d" strokeWidth="1.5" />
            <path d="M190 141Q204 148 217 140L214 147Q202 151 193 146Z" fill="#fffaf0" stroke="none" />
          </>}
        {glasses !== 'none' && <g stroke="#243b35" strokeWidth="3">
          {glasses === 'round' ? <>
            <circle cx="185" cy="115" r="15" fill="white" fillOpacity=".12" />
            <circle cx="222" cy="115" r="15" fill="white" fillOpacity=".12" />
          </> : <>
            <rect x="169" y="102" width="31" height="25" rx="5" fill="white" fillOpacity=".12" />
            <rect x="207" y="102" width="31" height="25" rx="5" fill="white" fillOpacity=".12" />
          </>}
          <path d="M200 113Q204 109 207 113M169 110L160 107M238 110L244 108" />
        </g>}
        </g>

        <path d="M264 213H400Q407 213 405 221L390 270H249Z" fill={laptopColor} />
        <path d="M265 214L252 267" stroke="white" strokeOpacity=".25" />
        <path d="M246 270H394L405 278H236Z" fill={laptopColor} />
        <circle className="character-laptop-light" cx="331" cy="242" r="7" fill="white" fillOpacity=".4" stroke="none" />

        {showPlant && <g>
          <g className="character-leaves">
          <path d="M70 246C57 225 58 205 66 190C83 202 88 221 79 241" fill="#4b8b5b" />
          <path d="M75 241C84 214 99 211 111 218C107 237 95 246 77 247" fill="#77ab70" />
          <path d="M71 237C53 214 37 217 32 229C43 243 56 248 74 246" fill="#578f58" />
          </g>
          <path d="M54 246H94L89 282H60Z" fill={accentColor} />
          <path d="M57 258H91" stroke="#bd9c5c" strokeWidth="7" />
        </g>}
        {showBooks && <g>
          <path d="M366 259L442 255V272L366 276Z" fill={accentColor} />
          <path d="M365 256L444 252V257L367 262Z" fill={shirtColor} />
          <path d="M365 276L443 272" stroke={shirtColor} strokeWidth="4" />
          <path d="M359 279L436 275V289L359 292Z" fill={accentColor} />
          <path d="M358 277L438 273V277L359 282Z" fill="#c19a4b" />
          <path d="M359 292L437 288" stroke="#c19a4b" strokeWidth="4" />
          <path d="M126 280Q153 266 181 275L198 283Q225 268 260 277L273 294Q227 285 198 300Q163 283 120 297Z" fill={accentColor} />
          <path d="M198 283V298M140 278L179 283M138 284L180 289M215 283L250 280M214 289L254 286" strokeOpacity=".3" strokeWidth="1.5" />
          <path d="M119 299Q166 288 198 303Q231 288 274 297" stroke={shirtColor} strokeWidth="4" />
        </g>}
      </g>
    </svg>
  );
}
