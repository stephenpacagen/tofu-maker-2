export type GenericFormat = {
  id: string;
  name: string;
  category: string;
  description: string;
};

const slug = (name: string) =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();

/** [name, category, description] as supplied for generic-format generations. */
const ENTRIES: [string, string, string][] = [
  ["SearchBar", "Social-Native & Conversation", "Mimics a search engine's autocomplete dropdown. Type a leading phrase and fill the suggestions with real worries/queries. Pull these from forum and voice-of-customer language so they ring true."],
  ["FakeDM", "Social-Native & Conversation", "This should look like a real screenshot from a phone. To tailor it focus on the texts sent / who is sending it. Use Fake DM making applications or use your phone if you have a fake account."],
  ["FakeIGStory", "Social-Native & Conversation", "Self explanatory - take care in choosing / taking an organic photo that feels almost UGC + adding text in a way that looks like a real insta story"],
  ["AMA", "Social-Native & Conversation", "This stands for ask me anything. The format is you replying to a comment."],
  ["FakeReddit", "Social-Native & Conversation", "Fake a reddit post. Pay attention to details - what subreddit is it posted on? what is the username? is the language casual enough?"],
  ["FakeTweet", "Social-Native & Conversation", "Similar to FakeDM you can use a fake tweet maker to write a tweet related to your angle. Ensure the language is candid & provocative to reflect what people expect from the app."],
  ["FakeText", "Social-Native & Conversation", "Fake a text message between friends. Imagine your persona is one of the texters. What would shock them? What would intrigue them? How would they react after using the product / someone telling them about the product?"],
  ["FakeChatGPT", "Social-Native & Conversation", "Think about the way Chat speaks when you ask it questions. It's usually very direct and fact-based so ensure you match that to do this format correctly"],
  ["FakeNote", "Social-Native & Conversation", "Keep it casual, add emojis! Make it on your phone and just screenshot. There may be apps online."],
  ["Podcast", "Social-Native & Conversation", "This is an AI generated two panel podcast snippet where the top panel asks a question or concern your audience might react / resonate to and the second panel pushes the product"],
  ["FakeCall", "Social-Native & Conversation", "Similar to FakeDM, but instead it's for call log history"],
  ["PhoneLockscreen", "Social-Native & Conversation", "Resembles the text preview when you get a message from someone while your phone's still locked."],
  ["IncomingCall", "Social-Native & Conversation", "Phone screen when you're getting an incoming call. Should have a \"decline\" and \"accept\" option."],
  ["ListBenefit", "Product, Proof & Comparison", "Choose the benefits carefully based on the persona you are targeting."],
  ["VennDiagram", "Product, Proof & Comparison", "Use the diagram as a way to show two key benefits that would be the biggest selling points (based on the angle)."],
  ["BeforeAfter", "Product, Proof & Comparison", "Pick two images that when juxtaposed visually highlight Pacagen's benefits. This can be used for symptoms, experiences, feeling etc."],
  ["UsVSThem", "Product, Proof & Comparison", "Compare us against competitors or alternative solutions that customers may be considering"],
  ["WouldYouRather", "Product, Proof & Comparison", "I haven't seen a lot of ad examples of this but would be interesting to try, Lots of design options, but the format helps you juxtapose options to sell your persona an idea."],
  ["SplitCompare", "Product, Proof & Comparison", "A vertical split-screen layout of them vs us: a frustrating pile of failed attempts on one side, PACAGEN as a clear answer on the other."],
  ["HeroProof", "Product, Proof & Comparison", "Emotional, issue-led headline over real product(-in-use) imagery, with a short supporting line beneath it. Visually simple; the headline carries the hook, the line underneath backs it up."],
  ["BadReview", "Pattern Interrupt & Experimental", "This subverts expectations. The bad review has to be very cleverly written to actually be highlighting a positive feature of the product. Visually simple but technically harder to write well."],
  ["TxtMeme", "Pattern Interrupt & Experimental", "Many different design possibilities but generally emulating what an internet 'meme' looks like. Be careful not to use any real memes. If you want something that exists, make Envato AI develop a version of it to avoid copyright issues"],
  ["Warning", "Pattern Interrupt & Experimental", "The fake warning / sensitive content pop up is scroll stopping which give you enough time to warn people about the 'good effects'"],
  ["PopReference", "Pattern Interrupt & Experimental", "Playing on nostalgia and building your creative around something that is nostalgic for the age group you are trying to speak to. Ex: for 65+ a big pop culture moment was ET"],
  ["IfYouAreSeeingThis", "Pattern Interrupt & Experimental", ""],
  ["WhatIWish", "Emotional, Lifestyle & Testimonial", "Simple imagery with text that starts with 'What I wish people knew'. Makes people curious enough to stop. Can be personalized by specifying who is writing it."],
  ["FakeQuote", "Emotional, Lifestyle & Testimonial", "Write a fake customer testimonial that is personalized to the angle you were assigned. Lots of design possibilities here but ensure main text is focus."],
  ["Handwritten", "Emotional, Lifestyle & Testimonial", "You can make varients of this with post it notes, whiteboards, or notebooks like the reference."],
  ["CandidTxt", "Emotional, Lifestyle & Testimonial", "A very candid photo that feels UGC with light text over it. This is differernt than the story post but it is a very similar format. The text should be placed more intentionally here and less organically than a fake story post."],
  ["DearX", "Emotional, Lifestyle & Testimonial", "Minimalist design with header text that says Dear X, where X is your intended audience. Think about what your audience identifies as so they resonate with the callout. Visit forums to get relevant words."],
  ["FounderLed", "Emotional, Lifestyle & Testimonial", "The founder speaks directly to camera, telling the story behind the product in their own voice. Strong for the science-led and emotional-connection angles; lead with the \"why I made this\" hook and what makes PACAGEN different."],
  ["CandidOverlay", "Emotional, Lifestyle & Testimonial", "A real, candid lifestyle photo of the persona in the emotional moment with text overlay."],
  ["FlowChart", "Education, Science & Problem Reframe", "An interactive question cascade that pulls the audience in by getting her to self-identify. Each step should be a yes she/he'll nod to, leading to the product as the answer. Tailor the questions to the angle's persona."],
  ["FactForward", "Education, Science & Problem Reframe", "This is very statistic driven. If you're mentioning exact numbers you are working in this format."],
  ["MythVSTruth", "Education, Science & Problem Reframe", "A simple graphic that has 'mythbusting' copy/structure. Consider what assumptions/beliefs you are trying to break."],
  ["DidYouKnow", "Education, Science & Problem Reframe", "Use the fun fact as a vehicle to dismantle existing beliefs in users or educate them about allergens"],
  ["FakeNews", "Education, Science & Problem Reframe", "Most effective when talking about the product as a medical breakthrough. Less effective when just spewing stats. Try to think of a clickbaity title that would work within your angle."],
  ["Infographic", "Education, Science & Problem Reframe", "Design is flexible here but the point is to not be product focused and instead focus on informing about the pain point. It should look impartial (not obviously Pacagen)"],
  ["ScienceEditorial", "Education, Science & Problem Reframe", "Abstract macro science visual (follicle, molecule, mechanism rendering) paired with benefit statement."],
  ["NewspaperProp", "Pattern Interrupt & Experimental", "A candid lifestyle image featuring a faux newspaper, magazine, or printed editorial piece as the main creative prop. Use bold headlines, editorial typography, and product imagery to make the message feel like a story someone discovered rather than a traditional ad. Strong for product announcements, lifestyle benefits, launches, or playful \"breaking news\" hooks."],
  ["StaticToVideo", "", "simply add sound/music & animation to the statics and turn them into videos"],
  ["SubwayProp", "Pattern Interrupt & Experimental", "A realistic subway entrance featuring an ad space you can see before walking down the stairs. Gives opportunity to imagine what this ad would look like in the real world"],
  ["GoodReview", "Emotional, Lifestyle & Testimonial", "Focusing on the real reviews we have recieved about the products, capturing people's experiences and how things have improved."],
  ["PetPerspective", "Emotional, Lifestyle & Testimonial", "Looking at how our product addresses pets' pain points as they 'share' their thoughts with us"],
  ["Yapper", "Education, Science & Problem Reframe", ""],
  ["Listicle", "Emotional, Lifestyle & Testimonial", ""],
  ["ThisOrThat", "Pattern Interrupt & Experimental", ""],
  ["ProgressTimeline", "Product, Proof & Comparison", "Visually maps the expected product experience or benefits across different time periods (e.g. Week 1 → Weeks 2–4 → Week 8+), helping communicate how results/progress build with continued use."],
  ["CinematicBroll", "Product, Proof & Comparison", "A polished, visually driven video built from cinematic product and lifestyle B-roll. Use intentional close-ups, movement, lighting, environmental shots and product-use moments, with concise on-screen copy guiding the story. No talking head required."],
  ["FakeApology", "Pattern Interrupt & Experimental", "Uses a mock brand apology or \"we're sorry\" statement as the hook, then flips the apology into a product story or benefit reveal. The brand pretends to apologize for making the solution too effective, too late, or for not telling the customer sooner. Best when the copy feels self-aware, slightly cheeky, and reads like an official brand statement rather than a conventional ad."],
  ["LifeGraph", "Pattern Interrupt & Experimental", "absurd graph logic instead of a informational graph with x/y axis"],
  ["QuadrantMap", "Pattern Interrupt & Experimental", ""],
  ["ShockVisual", "Pattern Interrupt & Experimental", "huge unexpected visual + provocative headline + tiny explanation + product"],
];

export const GENERIC_FORMATS: GenericFormat[] = ENTRIES.map(([name, category, description]) => ({
  id: slug(name),
  name: name.trim(),
  category: category.trim(),
  description: description.trim(),
}));

export function genericFormatById(id: string | null | undefined) {
  return GENERIC_FORMATS.find((format) => format.id === id) ?? null;
}
