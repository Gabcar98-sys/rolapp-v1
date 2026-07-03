import MyCharacters from './MyCharacters.jsx';

// Personajes: reutiliza la vista MyCharacters existente dentro del shell
// (sin onBack: la navegación la da el sidebar). Rediseño fino en F15.
export default function CharactersPage({ user }) {
  return <MyCharacters user={user} />;
}
