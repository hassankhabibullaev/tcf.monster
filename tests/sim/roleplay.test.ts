import { describe, it, expect } from "vitest";
import { RELATION, checkReply, relanceFor, roleplaySystem } from "../../worker/sim/roleplay.ts";

const p = { consigne: "Vous appelez le centre pour vous renseigner sur un cours du soir.", roleplay: { situation: "s", examinerRole: "secrétaire du Centre Saint-Laurent", register: "vous" as const, kind: "professionnel" } };

describe("the examiner's persona", () => {
  it("is a real person without any fact sheet, who answers the last question asked and hesitates only now and then", () => {
    const sys = roleplaySystem(p, { pace: "naturel" });
    expect(sys).toContain("secrétaire du Centre Saint-Laurent");
    expect(sys).toContain("aucune fiche, aucune liste");
    expect(sys).toContain("Tu réponds à sa DERNIÈRE question");
    expect(sys).not.toContain("fiche de faits");
    expect(sys).toContain("un prix → le chiffre");
    expect(sys).toContain("une réponse sur cinq ou six, pas plus");
    // she leaves doors ajar and is no cleverer than the question
    expect(sys).toContain("laisse volontairement une porte entrouverte");
    expect(sys).toContain("pas plus maligne que la question");
    expect(sys).toContain("1 à 10 mots, jamais plus");
    // what she must never do
    expect(sys).toContain("« je vais vérifier », « attendez, je regarde »");
    expect(sys).toContain("Tu ne proposes jamais un sujet ni une question");
    // the candidate opens the exchange; she no longer has a scripted greeting
    expect(sys).toContain("Le candidat ouvre l'échange");
    expect(sys).not.toContain("Tu as déjà dit");
    expect(sys).toContain("Débit naturel");
  });
  it("plays a friend, colleague or neighbour with « tu » when the situation calls for it", () => {
    const friend = { consigne: "Votre amie Nadia (l'examinatrice) revient d'un séjour à Québec. Vous lui posez des questions.", roleplay: { situation: "s", examinerRole: "Nadia, une amie qui revient de Québec", register: "tu" as const, kind: "ami" } };
    const sys = roleplaySystem(friend);
    expect(sys).toContain("tutoiement");
    expect(sys).toContain("Tu peux répéter ?");
    expect(sys).not.toContain("joue le client");
    expect(sys).not.toContain("Vous pouvez répéter ?");
    // the same rules as with a stranger: one fact per question, no leads
    expect(sys).toContain("Une question = UNE information");
    expect(sys).toContain("Tu ne proposes jamais un sujet ni une question");
    expect(relanceFor(friend)).toBe("Tu voulais savoir autre chose ?");
    // older subjects carry no register: vous
    expect(roleplaySystem(p)).toContain("Français, vouvoiement.");
    expect(relanceFor(p)).toBe("Vous vouliez savoir autre chose ?");
  });
  it("says « tu » to a friend, colleague, neighbour, relative or classmate, « vous » otherwise", () => {
    for (const k of ["ami", "collegue", "voisin", "famille", "camarade"] as const) expect(RELATION[k].register).toBe("tu");
    for (const k of ["professionnel", "inconnu"] as const) expect(RELATION[k].register).toBe("vous");
    // the card is written from her side: the prompt tells her that « je » is her
    const sys = roleplaySystem({ consigne: "Je suis votre voisine et je loue une maison près de la mer. Vous êtes intéressé et vous me posez des questions (prix, dates, etc.).", roleplay: { situation: "s", examinerRole: RELATION.voisin.role, register: "tu", kind: "voisin" } });
    expect(sys).toContain("« je », c'est toi");
    // the only points expected from the candidate are the card's
    expect(sys).toContain("(prix, dates)");
  });
});

describe("defects of a reply", () => {
  it("flags leads, offers, dodging and rambling; clarifications are fine", () => {
    expect(checkReply("Euh, c'est 280 dollars.")).toEqual({ hint: false, evasive: false, tooLong: false });
    expect(checkReply("Oui, bien sûr. Vous voulez connaître nos horaires ?").hint).toBe(true);
    expect(checkReply("C'est 280 dollars. Si vous voulez, je peux vous donner les horaires.").hint).toBe(true);
    expect(checkReply("Pour le matin, je n'ai pas d'information à ce sujet.").evasive).toBe(true);
    expect(checkReply("Attendez, je regarde… oui, 280 dollars.").evasive).toBe(true);
    expect(checkReply("Pardon, vous parlez de quel cours ?").hint).toBe(false);
    expect(checkReply("Vous pouvez répéter ?").hint).toBe(false);
    expect(checkReply("120 dollars. Si tu veux, je peux te montrer des photos.").hint).toBe(true);
    expect(checkReply("Pardon, tu parles de quoi exactement ?").hint).toBe(false);
    expect(checkReply("Alors le cours standard coûte 280 dollars pour dix semaines, les séances ont lieu le mardi et le jeudi de 18 h 30 à 20 h, au 2450 rue Saint-Laurent, et il faut apporter une pièce d'identité.").tooLong).toBe(true);
    expect(checkReply("Euh, ben… moi, ça m'est arrivé d'avoir du mal à trouver une place près de la salle. Par contre, dans le quartier, je ne peux pas te confirmer s'il y a une place.").tooLong).toBe(true);
    expect(checkReply("Pardon, je ne peux pas te dire les horaires exacts de la salle municipale.").evasive).toBe(true);
    expect(checkReply("Oui, un petit, juste derrière, gratuit le soir.").tooLong).toBe(false);
    expect(checkReply("Oui, vous devez apporter une pièce d'identité et un cahier pour le premier cours.").tooLong).toBe(true);
  });
});

describe("card points", () => {
  it("reads the points of the parenthesis and drops « etc. »", async () => {
    const { cardPoints } = await import("../../worker/sim/roleplay.ts");
    expect(cardPoints("Je travaille à la bibliothèque et je peux vous expliquer comment emprunter des documents. Vous voulez emprunter des documents et vous me posez des questions (durée, quantité autorisée, conditions, etc.).")).toEqual(["durée", "quantité autorisée", "conditions"]);
    expect(cardPoints("Vous me posez des questions (prix, horaires et conditions).")).toEqual(["prix", "horaires et conditions"]);
    expect(cardPoints("Une situation sans liste.")).toEqual([]);
  });
});
